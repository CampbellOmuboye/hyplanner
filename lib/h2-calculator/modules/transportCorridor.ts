import type { DemandModelResult, TransportCorridorInputs, ValidationIssue } from "../types";
import { clamp01 } from "../shared";

export function validateTransportCorridor(input: TransportCorridorInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(input.node_demands_kg) || input.node_demands_kg.length === 0) {
    issues.push({ field: "node_demands_kg", message: "Enter at least one node demand (kg)." });
  } else if (input.node_demands_kg.some((x) => !Number.isFinite(x) || x < 0)) {
    issues.push({ field: "node_demands_kg", message: "Node demands must be numbers (>= 0)." });
  }
  if (!input.average_distance_between_nodes || input.average_distance_between_nodes <= 0) {
    issues.push({ field: "average_distance_between_nodes", message: "Enter average distance (km) (> 0)." });
  }
  if (!input.cost_per_km_per_kg || input.cost_per_km_per_kg < 0) {
    issues.push({ field: "cost_per_km_per_kg", message: "Enter cost per km per kg (>= 0)." });
  }
  const lf = input.loss_factor ?? 0;
  if (!Number.isFinite(lf) || lf < 0 || lf > 0.49) {
    issues.push({ field: "loss_factor", message: "Loss factor must be between 0 and 0.49 (desk 1.0)." });
  }
  return issues;
}

export function computeTransportCorridor(input: TransportCorridorInputs): DemandModelResult {
  const node_demands = input.node_demands_kg ?? [];
  const total_hydrogen_demand = node_demands.reduce((a, b) => a + b, 0);
  const loss = clamp01(input.loss_factor ?? 0);
  const denom = Math.max(1e-9, 1 - loss);
  /** kg to move to satisfy delivered demand after losses */
  const transport_basis_kg = total_hydrogen_demand / denom;
  const average_distance_between_nodes = input.average_distance_between_nodes ?? 0;
  const cost_per_km_per_kg = input.cost_per_km_per_kg ?? 0;
  const total_network_transport_cost = transport_basis_kg * average_distance_between_nodes * cost_per_km_per_kg;

  const year =
    input.global.period_start && Number.isFinite(input.global.period_start)
      ? Math.floor(input.global.period_start)
      : new Date().getFullYear();

  return {
    user_type: "transport_corridor",
    yearly_results: [
      {
        year,
        node_demands_kg: node_demands,
        total_hydrogen_demand_kg: total_hydrogen_demand,
        loss_factor: loss,
        transport_basis_kg,
        average_distance_between_nodes,
        cost_per_km_per_kg,
        total_network_transport_cost,
      },
    ],
    cumulative_results: {},
    summary_metrics: {
      total_hydrogen_demand_kg: total_hydrogen_demand,
      hydrogen_kg: total_hydrogen_demand,
      transport_basis_kg,
      total_network_transport_cost,
    },
  };
}
