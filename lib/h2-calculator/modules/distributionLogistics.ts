import type { DemandModelResult, DistributionLogisticsInputs, ValidationIssue } from "../types";

export function validateDistributionLogistics(input: DistributionLogisticsInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.hydrogen_volume_input_method) {
    issues.push({ field: "hydrogen_volume_input_method", message: "Select how hydrogen volume is provided." });
  }
  if (input.hydrogen_volume_input_method !== "from_production") {
    if (!input.hydrogen_input_value_kg || input.hydrogen_input_value_kg <= 0) {
      issues.push({ field: "hydrogen_input_value_kg", message: "Enter hydrogen mass (kg) (> 0)." });
    }
  } else if (!input.hydrogen_input_value_kg || input.hydrogen_input_value_kg <= 0) {
    issues.push({
      field: "hydrogen_input_value_kg",
      message: "Link from production: run Production hub first, then Run here (or switch to From demand).",
    });
  }
  if (!input.transport_distance_km || input.transport_distance_km <= 0) {
    issues.push({ field: "transport_distance_km", message: "Enter transport distance (km) (> 0)." });
  }
  if (!input.transport_mode) {
    issues.push({ field: "transport_mode", message: "Select transport mode." });
  }
  if (!input.cost_per_km_per_kg || input.cost_per_km_per_kg < 0) {
    issues.push({ field: "cost_per_km_per_kg", message: "Enter cost per km per kg (>= 0)." });
  }
  return issues;
}

export function computeDistributionLogistics(input: DistributionLogisticsInputs): DemandModelResult {
  const transported_hydrogen_kg = input.hydrogen_input_value_kg ?? 0;
  const transport_distance_km = input.transport_distance_km ?? 0;
  const cost_per_km_per_kg = input.cost_per_km_per_kg ?? 0;
  const transport_cost = transported_hydrogen_kg * transport_distance_km * cost_per_km_per_kg;

  const year =
    input.global.period_start && Number.isFinite(input.global.period_start)
      ? Math.floor(input.global.period_start)
      : new Date().getFullYear();

  return {
    user_type: "distribution_logistics",
    yearly_results: [
      {
        year,
        hydrogen_volume_input_method: input.hydrogen_volume_input_method ?? "from_demand",
        transported_hydrogen_kg,
        transport_distance_km,
        transport_mode: input.transport_mode ?? "truck",
        cost_per_km_per_kg,
        transport_cost,
      },
    ],
    cumulative_results: {},
    summary_metrics: { transported_hydrogen_kg, hydrogen_kg: transported_hydrogen_kg, transport_cost },
  };
}
