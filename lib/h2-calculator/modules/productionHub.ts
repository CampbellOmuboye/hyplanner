import type { DemandModelResult, ProductionHubInputs, ValidationIssue } from "../types";
import { clamp01 } from "../shared";

export function validateProductionHub(input: ProductionHubInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cap = input.electrolyzer_capacity_MW ?? input.reformer_capacity_MW ?? 0;
  if (!cap || cap <= 0) {
    issues.push({
      field: "capacity_MW",
      message: "Enter electrolyzer capacity (MW) or reformer capacity (MW) (> 0).",
    });
  }
  if (typeof input.capacity_factor !== "number") {
    issues.push({ field: "capacity_factor", message: "Enter capacity factor (0–1)." });
  } else if (clamp01(input.capacity_factor) !== input.capacity_factor) {
    issues.push({ field: "capacity_factor", message: "Capacity factor must be between 0 and 1." });
  }
  if (!input.efficiency_kWh_per_kg || input.efficiency_kWh_per_kg <= 0) {
    issues.push({ field: "efficiency_kWh_per_kg", message: "Enter efficiency (kWh/kg) (> 0)." });
  }
  if (typeof input.capex !== "number") issues.push({ field: "capex", message: "Enter annualized capex (EUR/year)." });
  if (typeof input.opex !== "number") issues.push({ field: "opex", message: "Enter annual opex (EUR/year)." });
  const p = input.annual_electricity_price_eur_per_MWh;
  if (p !== undefined && (!Number.isFinite(p) || p < 0)) {
    issues.push({ field: "annual_electricity_price_eur_per_MWh", message: "Electricity price must be a number ≥ 0." });
  }
  return issues;
}

export function computeProductionHub(input: ProductionHubInputs): DemandModelResult {
  const capacityMW = input.electrolyzer_capacity_MW ?? input.reformer_capacity_MW ?? 0;
  const capacity_factor = clamp01(input.capacity_factor ?? 0);
  const efficiency = input.efficiency_kWh_per_kg ?? 1;

  const annual_hydrogen_production_kg = (capacityMW * capacity_factor * 8760 * 1000) / efficiency;
  const capex = input.capex ?? 0;
  const opex = input.opex ?? 0;
  const fixed_eur_per_kg = annual_hydrogen_production_kg > 0 ? (capex + opex) / annual_hydrogen_production_kg : 0;

  let variable_eur_per_kg = 0;
  if (input.global.hydrogen_type === "Green" && input.annual_electricity_price_eur_per_MWh !== undefined) {
    const priceMWh = input.annual_electricity_price_eur_per_MWh;
    if (Number.isFinite(priceMWh) && priceMWh >= 0) {
      variable_eur_per_kg = (priceMWh * efficiency) / 1000;
    }
  }

  const hydrogen_cost_per_kg = fixed_eur_per_kg + variable_eur_per_kg;

  const year =
    input.global.period_start && Number.isFinite(input.global.period_start)
      ? Math.floor(input.global.period_start)
      : new Date().getFullYear();

  return {
    user_type: "production_hub",
    yearly_results: [
      {
        year,
        annual_hydrogen_production_kg,
        hydrogen_cost_per_kg,
        fixed_cost_eur_per_kg: fixed_eur_per_kg,
        variable_cost_eur_per_kg: variable_eur_per_kg,
      },
    ],
    cumulative_results: {},
    summary_metrics: {
      annual_hydrogen_production_kg,
      hydrogen_kg: annual_hydrogen_production_kg,
      hydrogen_cost_per_kg,
      fixed_cost_eur_per_kg: fixed_eur_per_kg,
      variable_cost_eur_per_kg: variable_eur_per_kg,
    },
  };
}
