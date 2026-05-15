import type { DemandModelResult, OfftakeClusterInputs, ValidationIssue } from "../types";
import { co2_price, expandScenario } from "../prices";
import { ensureYearRange, yearsInclusive } from "../shared";
import { computeOfftakeQsBreakdown, normalizeReplacementGoal, offtakeHasAnyDemandStream } from "../offtakeQsDemand";

export function validateOfftakeCluster(input: OfftakeClusterInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!offtakeHasAnyDemandStream(input)) {
    issues.push({
      field: "demand_streams",
      message: "Enter at least one demand stream (natural gas, grey H₂, diesel, new green H₂ mobility, or grid-balancing electrolysis).",
    });
  }

  const ngNm3Dedicated = input.natural_gas_usage_nm3_per_year ?? 0;
  const ng = ngNm3Dedicated > 0 || (input.annual_natural_gas_consumption ?? 0) > 0;
  if (ng) {
    if (ngNm3Dedicated <= 0) {
      if (!input.annual_natural_gas_consumption_unit) {
        issues.push({ field: "annual_natural_gas_consumption_unit", message: "Select a natural gas unit when using the energy/volume row." });
      }
    }
    if (typeof input.replacement_percentage !== "number" || !Number.isFinite(input.replacement_percentage)) {
      issues.push({ field: "replacement_percentage", message: "Enter natural gas replacement goal (0–1 or 0–100 %), QS `replacement_goal_percent`." });
    }
  }

  const greyNm3 = input.grey_h2_usage_nm3_per_year ?? 0;
  if (greyNm3 > 0) {
    const grp = input.grey_h2_replacement_percentage;
    if (grp !== undefined && (!Number.isFinite(grp) || grp < 0)) {
      issues.push({ field: "grey_h2_replacement_percentage", message: "Grey H₂ replacement must be a non-negative number (0–1 or 0–100 %)." });
    }
  }

  const dieselL = input.mobility_diesel_liters_per_year ?? 0;
  if (dieselL > 0) {
    const mp = input.mobility_replacement_percentage;
    if (mp !== undefined && (!Number.isFinite(mp) || mp < 0)) {
      issues.push({
        field: "mobility_replacement_percentage",
        message: "Diesel replacement must be a non-negative number (0–1 or 0–100 %).",
      });
    }
  }

  const yr = ensureYearRange(input.global.period_start, input.global.period_end);
  if (!yr) {
    issues.push({ field: "period", message: "Set a valid period start/end year." });
  }
  if (!input.global.co2_price_scenario) {
    issues.push({ field: "co2_price_scenario", message: "Select a CO₂ price scenario." });
  }

  if (issues.length === 0 && offtakeHasAnyDemandStream(input)) {
    const b = computeOfftakeQsBreakdown(input);
    if (b.total_hydrogen_kg_per_year <= 0) {
      issues.push({
        field: "total_hydrogen_demand",
        message: "Total H₂ demand is zero — increase consumption or replacement on at least one stream.",
      });
    }
  }

  return issues;
}

export function computeOfftakeCluster(input: OfftakeClusterInputs): DemandModelResult {
  const b = computeOfftakeQsBreakdown(input);
  const avoided_co2_ton = b.avoided_co2_ton_total;

  const ngGoal = normalizeReplacementGoal(input.replacement_percentage, 0);
  const ngMWh = b.natural_gas_thermal_mwh_per_year;
  const replaceable_volume_MWh = b.replaceable_natural_gas_thermal_mwh_per_year;

  const h = {
    hydrogen_volume_MWh: b.hydrogen_energy_mwh_per_year,
    hydrogen_kg: b.total_hydrogen_kg_per_year,
    hydrogen_ton: b.total_hydrogen_ton_per_year,
    hydrogen_Nm3: b.hydrogen_nm3_per_year,
  };

  const yr = ensureYearRange(input.global.period_start, input.global.period_end);
  const years = yr ? yearsInclusive(yr.start, yr.end) : [];
  const scenarios = expandScenario(input.global.co2_price_scenario ?? "Medium");

  const yearly_results: Array<Record<string, unknown>> = [];
  const cumulative_results: Record<string, unknown> = {};
  const cumulativeByYear: Record<string, number[]> = {};

  scenarios.forEach((scenario) => {
    let cumulative = 0;
    const series: number[] = [];
    years.forEach((year) => {
      const price = co2_price(year, scenario);
      const co2_cost_savings_eur = avoided_co2_ton * price;
      cumulative += co2_cost_savings_eur;
      series.push(cumulative);

      yearly_results.push({
        year,
        scenario,
        natural_gas_volume_MWh: ngMWh,
        replaceable_volume_MWh,
        natural_gas_from_nm3_path: b.natural_gas_from_nm3_path,
        baseline_natural_gas_nm3_per_year: b.baseline_natural_gas_nm3_per_year,
        baseline_grey_h2_nm3_per_year: b.baseline_grey_h2_nm3_per_year,
        baseline_diesel_l_per_year: b.baseline_diesel_l_per_year,
        avoided_co2_ton,
        avoided_co2_ton_from_natural_gas: b.avoided_co2_ton_from_natural_gas,
        avoided_co2_ton_from_grey_h2: b.avoided_co2_ton_from_grey_h2,
        avoided_co2_ton_from_diesel: b.avoided_co2_ton_from_diesel,
        co2_cost_savings_eur,
        cumulative_co2_cost_savings_eur: cumulative,
        ...h,
      });
    });
    cumulative_results[`cumulative_co2_cost_savings_eur_${scenario}`] = cumulative;
    cumulativeByYear[scenario] = series;
  });

  const summary_metrics: Record<string, unknown> = {
    natural_gas_from_nm3_path: b.natural_gas_from_nm3_path,
    natural_gas_volume_MWh: ngMWh,
    replaceable_volume_MWh,
    natural_gas_replacement_goal: ngGoal,
    avoided_co2_ton,
    avoided_co2_ton_from_natural_gas: b.avoided_co2_ton_from_natural_gas,
    avoided_co2_ton_from_grey_h2: b.avoided_co2_ton_from_grey_h2,
    avoided_co2_ton_from_diesel: b.avoided_co2_ton_from_diesel,
    baseline_natural_gas_nm3_per_year: b.baseline_natural_gas_nm3_per_year,
    baseline_grey_h2_nm3_per_year: b.baseline_grey_h2_nm3_per_year,
    baseline_diesel_l_per_year: b.baseline_diesel_l_per_year,
    hydrogen_kg_from_natural_gas: b.hydrogen_kg_from_natural_gas,
    hydrogen_kg_from_grey_h2: b.hydrogen_kg_from_grey_h2,
    hydrogen_kg_from_mobility_diesel: b.hydrogen_kg_from_mobility_diesel,
    hydrogen_kg_from_new_green_h2_mobility: b.hydrogen_kg_from_new_green_h2_mobility,
    hydrogen_kg_from_grid_balancing: b.hydrogen_kg_from_grid_balancing,
    hydrogen_ton_per_year_from_natural_gas: b.hydrogen_kg_from_natural_gas / 1000,
    hydrogen_ton_per_year_from_grey_h2: b.hydrogen_kg_from_grey_h2 / 1000,
    hydrogen_ton_per_year_from_mobility_diesel: b.hydrogen_kg_from_mobility_diesel / 1000,
    hydrogen_ton_per_year_from_new_green_h2_mobility: b.hydrogen_kg_from_new_green_h2_mobility / 1000,
    hydrogen_ton_per_year_from_grid_balancing: b.hydrogen_kg_from_grid_balancing / 1000,
    required_h2_ton_per_year: b.total_hydrogen_ton_per_year,
    required_h2_ton_per_year_from_natural_gas: b.hydrogen_kg_from_natural_gas / 1000,
    required_h2_ton_per_year_from_grey_h2: b.hydrogen_kg_from_grey_h2 / 1000,
    required_h2_ton_per_year_from_mobility_diesel: b.hydrogen_kg_from_mobility_diesel / 1000,
    required_h2_ton_per_year_from_new_green_h2_mobility: b.hydrogen_kg_from_new_green_h2_mobility / 1000,
    required_h2_ton_per_year_from_grid_balancing: b.hydrogen_kg_from_grid_balancing / 1000,
    total_hydrogen_demand_kg: b.total_hydrogen_kg_per_year,
    hydrogen_kg: b.total_hydrogen_kg_per_year,
    hydrogen_ton_per_year: b.total_hydrogen_ton_per_year,
    hydrogen_nm3_per_year: b.hydrogen_nm3_per_year,
    hydrogen_energy_mwh_per_year: b.hydrogen_energy_mwh_per_year,
  };

  scenarios.forEach((scenario) => {
    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    if (firstYear !== undefined && years.length > 0) {
      const firstPrice = co2_price(firstYear, scenario);
      summary_metrics[`co2_cost_savings_eur_${scenario}_first_year`] = avoided_co2_ton * firstPrice;
    }
    if (lastYear !== undefined && years.length > 0) {
      const lastPrice = co2_price(lastYear, scenario);
      summary_metrics[`co2_cost_savings_eur_${scenario}_last_year`] = avoided_co2_ton * lastPrice;
    }
  });

  scenarios.forEach((scenario) => {
    const series = cumulativeByYear[scenario] ?? [];
    years.forEach((y, i) => {
      cumulative_results[`cumulative_co2_cost_savings_eur_${scenario}_${y}`] = series[i] ?? 0;
    });
  });

  return {
    user_type: "offtake_cluster",
    yearly_results,
    cumulative_results,
    summary_metrics,
  };
}
