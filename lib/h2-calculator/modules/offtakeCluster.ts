import type { DemandModelResult, OfftakeClusterInputs, ValidationIssue } from "../types";
import { co2_price, expandScenario } from "../prices";
import { clamp01, ensureYearRange, hydrogenFromMWh, naturalGasToMWh, yearsInclusive } from "../shared";

const EMISSION_FACTOR_TON_CO2_PER_MWH = 0.1827186807;

export function validateOfftakeCluster(input: OfftakeClusterInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.annual_natural_gas_consumption || input.annual_natural_gas_consumption <= 0) {
    issues.push({ field: "annual_natural_gas_consumption", message: "Enter annual natural gas consumption (> 0)." });
  }
  if (!input.annual_natural_gas_consumption_unit) {
    issues.push({ field: "annual_natural_gas_consumption_unit", message: "Select a unit." });
  }
  if (typeof input.replacement_percentage !== "number") {
    issues.push({ field: "replacement_percentage", message: "Enter replacement percentage (0–1)." });
  }
  const r = clamp01(input.replacement_percentage ?? 0);
  if (r !== (input.replacement_percentage ?? r)) {
    issues.push({ field: "replacement_percentage", message: "Replacement percentage must be between 0 and 1." });
  }
  const yr = ensureYearRange(input.global.period_start, input.global.period_end);
  if (!yr) {
    issues.push({ field: "period", message: "Set a valid period start/end year." });
  }
  if (!input.global.co2_price_scenario) {
    issues.push({ field: "co2_price_scenario", message: "Select a CO₂ price scenario." });
  }
  return issues;
}

export function computeOfftakeCluster(input: OfftakeClusterInputs): DemandModelResult {
  const unit = input.annual_natural_gas_consumption_unit ?? "MWh";
  const ngMWh = naturalGasToMWh(input.annual_natural_gas_consumption ?? 0, unit);
  const replacement = clamp01(input.replacement_percentage ?? 0);
  const replaceable_volume_MWh = ngMWh * replacement;
  const avoided_co2_ton = replaceable_volume_MWh * EMISSION_FACTOR_TON_CO2_PER_MWH;
  const h = hydrogenFromMWh(replaceable_volume_MWh);

  const yr = ensureYearRange(input.global.period_start, input.global.period_end);
  const years = yr ? yearsInclusive(yr.start, yr.end) : [];
  const scenarios = expandScenario(input.global.co2_price_scenario ?? "Medium");

  const yearly_results: Array<Record<string, unknown>> = [];
  const cumulative_results: Record<string, unknown> = {};
  /** Per scenario: array of cumulative € by year index */
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
        avoided_co2_ton,
        co2_cost_savings_eur,
        cumulative_co2_cost_savings_eur: cumulative,
        ...h,
      });
    });
    cumulative_results[`cumulative_co2_cost_savings_eur_${scenario}`] = cumulative;
    cumulativeByYear[scenario] = series;
  });

  const summary_metrics: Record<string, unknown> = {
    natural_gas_volume_MWh: ngMWh,
    replaceable_volume_MWh,
    avoided_co2_ton,
    hydrogen_kg: h.hydrogen_kg,
    hydrogen_ton_per_year: h.hydrogen_ton,
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
