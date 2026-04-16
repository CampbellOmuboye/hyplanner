export type ProblemConstraintStatus = "unknown" | "risk" | "confirmed";

export type ProblemConstraintKey =
  | "gridCapacity"
  | "permitting"
  | "water"
  | "landZoning"
  | "community"
  | "capexFunding";

export type ProjectType = "production" | "distribution" | "offtake" | "corridor";

export type ProblemDefinitionInput = {
  useCase: string;
  geographyScope: string;
  projectType: ProjectType;
  targetWindow: string;
  constraints: Record<ProblemConstraintKey, { status: ProblemConstraintStatus; notes?: string }>;
};

export type LocationSignals = { renewables: boolean; grid: boolean; transport: boolean; industry: boolean };

export type GuidanceCard = {
  title: string;
  body: string;
  tone: "info" | "warn";
};

export type PlanningProfile = {
  preferredSignals: LocationSignals;
  seedLocationRegion?: string;
  seedCapacityTargetQuarter?: "q1" | "h1" | "fy" | "12m";
  guidance: GuidanceCard[];
};

function includesAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

export function derivePlanningProfile(problem: ProblemDefinitionInput): PlanningProfile {
  const useCase = problem.useCase.toLowerCase();
  const projectType = problem.projectType;

  const preferredSignals: LocationSignals = {
    renewables: projectType === "production",
    grid: projectType === "production" || projectType === "distribution",
    transport: projectType === "corridor" || useCase === "mobility" || includesAny(useCase, ["export", "port"]),
    industry: projectType === "offtake" || includesAny(useCase, ["industrial", "refining", "chemicals", "ammonia"]),
  };

  // Soft defaults: only applied if the user hasn't set anything.
  const seedLocationRegion = problem.geographyScope.trim() ? problem.geographyScope.trim() : undefined;
  const seedCapacityTargetQuarter = inferCapacityTargetQuarter(problem.targetWindow);

  const guidance: GuidanceCard[] = [];
  const c = problem.constraints;

  if (c.permitting.status !== "confirmed") {
    guidance.push({
      tone: c.permitting.status === "risk" ? "warn" : "info",
      title: "Permitting is not confirmed yet",
      body: "Capture the likely pathway, authority, and evidence needed before committing to a site or timeline.",
    });
  }

  if (c.gridCapacity.status !== "confirmed") {
    guidance.push({
      tone: c.gridCapacity.status === "risk" ? "warn" : "info",
      title: "Grid capacity is not confirmed yet",
      body: "Treat connection capacity and lead-times as assumptions until validated with the relevant network operator.",
    });
  }

  if (c.water.status === "risk") {
    guidance.push({
      tone: "warn",
      title: "Water access flagged as risk",
      body: "Make water sourcing, permitting, and treatment needs explicit in the assessment and stakeholder plan.",
    });
  }

  if (c.community.status === "risk") {
    guidance.push({
      tone: "warn",
      title: "Community acceptance flagged as risk",
      body: "Add an engagement plan and identify local partners early to reduce late-stage friction.",
    });
  }

  return { preferredSignals, seedLocationRegion, seedCapacityTargetQuarter, guidance };
}

export function inferCapacityTargetQuarter(targetWindowRaw: string): PlanningProfile["seedCapacityTargetQuarter"] {
  const t = targetWindowRaw.trim().toLowerCase();
  if (!t) return undefined;

  if (includesAny(t, ["next quarter", "q1", "q2", "q3", "q4", "quarter"])) return "q1";
  if (includesAny(t, ["h1", "half", "two quarters", "2 quarters", "6 months", "6m"])) return "h1";
  if (includesAny(t, ["fiscal", "fy", "this year"])) return "fy";
  if (includesAny(t, ["12 months", "12m", "1 year", "one year", "year"])) return "12m";

  return undefined;
}

export function problemMaterialKey(problem: ProblemDefinitionInput): string {
  const statuses = Object.fromEntries(
    (Object.keys(problem.constraints) as ProblemConstraintKey[]).map((k) => [k, problem.constraints[k].status])
  );
  return JSON.stringify({ useCase: problem.useCase, projectType: problem.projectType, statuses });
}

