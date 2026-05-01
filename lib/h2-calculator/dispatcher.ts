import type { DemandModelInput, DemandModelResult, ValidationIssue } from "./types";
import { computeOfftakeCluster, validateOfftakeCluster } from "./modules/offtakeCluster";
import { computeProductionHub, validateProductionHub } from "./modules/productionHub";
import { computeDistributionLogistics, validateDistributionLogistics } from "./modules/distributionLogistics";
import { computeTransportCorridor, validateTransportCorridor } from "./modules/transportCorridor";

export function validateDemandModel(input: DemandModelInput): ValidationIssue[] {
  switch (input.user_type) {
    case "offtake_cluster":
      return validateOfftakeCluster(input);
    case "production_hub":
      return validateProductionHub(input);
    case "distribution_logistics":
      return validateDistributionLogistics(input);
    case "transport_corridor":
      return validateTransportCorridor(input);
  }
}

export function computeDemandModel(input: DemandModelInput): DemandModelResult {
  switch (input.user_type) {
    case "offtake_cluster":
      return computeOfftakeCluster(input);
    case "production_hub":
      return computeProductionHub(input);
    case "distribution_logistics":
      return computeDistributionLogistics(input);
    case "transport_corridor":
      return computeTransportCorridor(input);
  }
}
