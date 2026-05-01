"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WORKFLOW_STEPS, WORKFLOW_STEP_COUNT } from "@/lib/hyplanner-workflow";
import {
  addProjectVersion,
  createProjectWithSnapshot,
  listProjectVersions,
  loadProjectVersion,
  type ProjectSnapshot,
  type ProjectVersionMeta,
} from "@/lib/hyplanner-projects-storage";
import { getRegionById } from "@/lib/opportunity-map/mockRegions";
import {
  derivePlanningProfile,
  problemMaterialKey,
  type ProblemConstraintKey as ProfileConstraintKey,
  type ProblemConstraintStatus as ProfileConstraintStatus,
} from "@/lib/planning-profile";
import { computeDemandModel, validateDemandModel } from "@/lib/h2-calculator/dispatcher";
import type {
  DemandModelInput,
  DemandModelResult,
  UserType,
  ValidationIssue,
} from "@/lib/h2-calculator/types";
import {
  calculateDiscountedPaybackPeriod,
  calculatePaybackPeriod,
  irr,
  npv,
  type CashFlow,
} from "@/step4/businessCaseEngine";
import { WorkflowStepIcon } from "./WorkflowStepIcon";
import { HydrogenOpportunityMap } from "./opportunity-map/HydrogenOpportunityMap";

const STORAGE_KEY = "hyplanner.project.v1";

type StakeholderRow = { id: string; name: string; org: string; role: string; stance: string };

type ProblemConstraintKey =
  | "gridCapacity"
  | "permitting"
  | "water"
  | "landZoning"
  | "community"
  | "capexFunding";

type ProblemConstraintStatus = "unknown" | "risk" | "confirmed";

type ProblemDefinition = {
  statement: string;
  useCase: string;
  secondaryUseCases: string[];
  successCriteria: string[];
  geographyScope: string;
  projectType: "production" | "distribution" | "offtake" | "corridor";
  targetWindow: string;
  constraints: Record<ProblemConstraintKey, { status: ProblemConstraintStatus; notes: string }>;
};

export type LocationSignals = { renewables: boolean; grid: boolean; transport: boolean; industry: boolean };

export type LocationCandidate = {
  id: string;
  regionId?: string;
  name: string;
  boundary: string;
  notes: string;
  rationale: string;
  signals: LocationSignals;
  rank: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkplanTaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type WorkplanTaskCategory = "workplan" | "risk-mitigation" | "stakeholder" | "data";

export type WorkplanTask = {
  id: string;
  title: string;
  description: string;
  stepSlug?: string;
  category: WorkplanTaskCategory;
  status: WorkplanTaskStatus;
  owner: string;
  startDate: string;
  dueDate: string;
  dependsOnIds: string[];
  evidenceLinks: string[];
  createdAt: string;
  updatedAt: string;
};

export type PlannerState = {
  projectTitle: string;
  problem: ProblemDefinition;
  location: {
    activeCandidateId: string;
    candidates: LocationCandidate[];
  };
  stakeholders: StakeholderRow[];
  demand: { baselineTPerYear: string; scenario: string; sector: string; assumptions: string };
  demandModel: DemandModelInput;
  demandResults: DemandModelResult | null;
  assessment: { technical: string; regulatory: string; commercial: string; offtake: string; notes: string };
  businessCase: {
    project_years: number;
    discount_rate: number;
    capex_eur: number;
    revenue_eur_per_year: number;
    opex_eur_per_year: number;
    revenue_linked_to_step3: boolean;
    hydrogen_price_eur_per_kg: number;
  };
  workplan: { tasks: WorkplanTask[] };
  capacity: {
    hydrogenSafety: boolean;
    markets: boolean;
    operations: boolean;
    standards: boolean;
    targetQuarter: string;
  };
  expert: { objectives: string; questions: string; contact: string };
  feedback: { roadmapConnect: boolean; roadmapApis: boolean; roadmapReporting: boolean; comments: string };
};

function isoNow() {
  return new Date().toISOString();
}

function isoDatePlusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function makeId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID ? `${prefix}${crypto.randomUUID()}` : `${prefix}${Date.now()}`;
}

function deriveUserType(projectType: ProblemDefinition["projectType"]): UserType {
  switch (projectType) {
    case "production":
      return "production_hub";
    case "distribution":
      return "distribution_logistics";
    case "offtake":
      return "offtake_cluster";
    case "corridor":
      return "transport_corridor";
  }
}

function formatUserTypeLabel(u: UserType): string {
  switch (u) {
    case "production_hub":
      return "Production hub";
    case "distribution_logistics":
      return "Distribution & logistics";
    case "offtake_cluster":
      return "Offtake cluster";
    case "transport_corridor":
      return "Transport corridor";
  }
}

function formatNumber(n: unknown, opts?: Intl.NumberFormatOptions): string {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat(undefined, opts).format(x);
}

function formatCurrencyEUR(n: unknown): string {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(x);
}

function formatPercent(n: unknown, opts?: { maximumFractionDigits?: number }): string {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: opts?.maximumFractionDigits ?? 1,
  }).format(x);
}

function getHydrogenKgPerYearFromDemandResults(r: DemandModelResult | null): number | null {
  if (!r) return null;
  const sm: any = r.summary_metrics ?? {};
  const candidates: unknown[] = [
    sm.annual_hydrogen_production_kg,
    sm.total_hydrogen_demand_kg,
    sm.transported_hydrogen_kg,
    sm.hydrogen_kg,
  ];
  for (const v of candidates) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Empty or non-numeric input → undefined (never NaN — keeps controlled inputs stable). */
function parseOptionalFloat(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** `value=` for number fields; treats NaN as empty (recovery if legacy state had NaN). */
function finiteNumberFieldValue(v: number | undefined): string | number {
  if (v === undefined) return "";
  return Number.isFinite(v) ? v : "";
}

function demandScenarioBadgeClass(scenario: string | undefined): string {
  switch (scenario) {
    case "Low":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80";
    case "Medium":
      return "bg-amber-100 text-amber-950 ring-1 ring-amber-200/80";
    case "High":
      return "bg-rose-100 text-rose-900 ring-1 ring-rose-200/80";
    default:
      return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/80";
  }
}

function DemandKpiCard({
  label,
  value,
  hint,
  emphasis = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: "default" | "lead";
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-[box-shadow,transform] duration-200 ${
        emphasis === "lead"
          ? "border-orange-300/90 bg-gradient-to-br from-orange-50/90 via-white to-white ring-1 ring-orange-200/60"
          : "border-zinc-200/85 bg-white hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-orange-100/80"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function defaultDemandModel(u: UserType): DemandModelInput {
  const base = { global: {} };
  switch (u) {
    case "offtake_cluster":
      return { user_type: u, ...base, annual_natural_gas_consumption_unit: "MWh", replacement_percentage: 0.3 };
    case "production_hub":
      return {
        user_type: u,
        global: { hydrogen_type: "Green" },
        capacity_factor: 0.6,
        efficiency_kWh_per_kg: 52,
        capex: 0,
        opex: 0,
      };
    case "distribution_logistics":
      return {
        user_type: u,
        ...base,
        hydrogen_volume_input_method: "from_demand",
        transport_mode: "truck",
        cost_per_km_per_kg: 0,
      };
    case "transport_corridor":
      return { user_type: u, ...base, node_demands_kg: [], cost_per_km_per_kg: 0, loss_factor: 0 };
  }
}

/** Resolve linked inputs (e.g. distribution from last production result) before validate/compute. */
function buildDemandModelForRun(state: PlannerState): DemandModelInput {
  const m = state.demandModel;
  if (m.user_type !== "distribution_logistics") return m;
  if (m.hydrogen_volume_input_method !== "from_production") return m;
  const pr = state.demandResults;
  const kg =
    pr?.user_type === "production_hub" && typeof pr.summary_metrics?.annual_hydrogen_production_kg === "number"
      ? (pr.summary_metrics.annual_hydrogen_production_kg as number)
      : NaN;
  if (!Number.isFinite(kg) || kg <= 0) return m;
  return { ...m, hydrogen_input_value_kg: kg };
}

function createInitialState(): PlannerState {
  const now = isoNow();
  const candidateId = makeId("lc-");
  return {
    projectTitle: "",
    problem: {
      statement: "",
      useCase: "",
      secondaryUseCases: [],
      successCriteria: [""],
      geographyScope: "",
      projectType: "production",
      targetWindow: "",
      constraints: {
        gridCapacity: { status: "unknown", notes: "" },
        permitting: { status: "unknown", notes: "" },
        water: { status: "unknown", notes: "" },
        landZoning: { status: "unknown", notes: "" },
        community: { status: "unknown", notes: "" },
        capexFunding: { status: "unknown", notes: "" },
      },
    },
    location: {
      activeCandidateId: candidateId,
      candidates: [
        {
          id: candidateId,
          regionId: undefined,
          name: "",
          boundary: "",
          notes: "",
          rationale: "",
          signals: { renewables: false, grid: false, transport: false, industry: false },
          rank: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
    stakeholders: [],
    demand: { baselineTPerYear: "", scenario: "mid", sector: "", assumptions: "" },
    demandModel: defaultDemandModel("production_hub"),
    demandResults: null,
    assessment: { technical: "", regulatory: "", commercial: "", offtake: "", notes: "" },
    businessCase: {
      project_years: 15,
      discount_rate: 0.08,
      capex_eur: 0,
      revenue_eur_per_year: 0,
      opex_eur_per_year: 0,
      revenue_linked_to_step3: true,
      hydrogen_price_eur_per_kg: 0,
    },
    workplan: { tasks: [] },
    capacity: { hydrogenSafety: false, markets: false, operations: false, standards: false, targetQuarter: "" },
    expert: { objectives: "", questions: "", contact: "email" },
    feedback: { roadmapConnect: false, roadmapApis: false, roadmapReporting: false, comments: "" },
  };
}

export type DecisionLogEntry = {
  id: string;
  text: string;
  at: string;
};

type PersistedPayload = {
  v: 1;
  state: PlannerState;
  currentStep: number;
  decisions: DecisionLogEntry[];
  workflowComplete: boolean;
};

function getActiveLocationCandidate(s: PlannerState): LocationCandidate {
  const active = s.location.candidates.find((c) => c.id === s.location.activeCandidateId);
  return active ?? s.location.candidates[0];
}

function normalizePlannerState(raw: PlannerState): PlannerState {
  const base = createInitialState();
  const merged: PlannerState = {
    ...base,
    ...raw,
    problem: { ...base.problem, ...(raw.problem ?? base.problem) },
    demand: { ...base.demand, ...(raw.demand ?? base.demand) },
    assessment: { ...base.assessment, ...(raw.assessment ?? base.assessment) },
    businessCase: { ...base.businessCase, ...((raw as any).businessCase ?? base.businessCase) },
    capacity: { ...base.capacity, ...(raw.capacity ?? base.capacity) },
    expert: { ...base.expert, ...(raw.expert ?? base.expert) },
    feedback: { ...base.feedback, ...(raw.feedback ?? base.feedback) },
    stakeholders: Array.isArray(raw.stakeholders) ? raw.stakeholders : [],
    location: base.location,
    workplan: base.workplan,
    demandModel: (raw as unknown as { demandModel?: DemandModelInput })?.demandModel ?? base.demandModel,
    demandResults: (raw as unknown as { demandResults?: DemandModelResult | null })?.demandResults ?? null,
  };

  const loc = (raw as unknown as { location?: Partial<PlannerState["location"]> })?.location;
  if (loc && Array.isArray((loc as any).candidates)) {
    const candidates = ((loc as any).candidates as unknown[]).filter(Boolean) as LocationCandidate[];
    const activeId =
      typeof (loc as any).activeCandidateId === "string" ? ((loc as any).activeCandidateId as string) : "";
    merged.location = {
      activeCandidateId:
        candidates.find((c) => c.id === activeId)?.id ?? candidates[0]?.id ?? base.location.activeCandidateId,
      candidates: candidates.length > 0 ? candidates : base.location.candidates,
    };
  } else {
    // Back-compat: older single-location shape.
    const legacy = (loc ?? (raw as any).location ?? {}) as any;
    const now = isoNow();
    const candidateId = makeId("lc-");
    merged.location = {
      activeCandidateId: candidateId,
      candidates: [
        {
          id: candidateId,
          regionId: typeof legacy.selectedRegionId === "string" ? legacy.selectedRegionId : undefined,
          name: typeof legacy.region === "string" ? legacy.region : "",
          boundary: typeof legacy.boundary === "string" ? legacy.boundary : "",
          notes: typeof legacy.notes === "string" ? legacy.notes : "",
          rationale: "",
          signals: (legacy.signals as LocationSignals) ?? { renewables: false, grid: false, transport: false, industry: false },
          rank: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  }

  const wp = (raw as any).workplan;
  merged.workplan = {
    tasks: wp && Array.isArray(wp.tasks) ? (wp.tasks as WorkplanTask[]) : [],
  };

  const expectedUserType = deriveUserType(merged.problem.projectType);
  if (!merged.demandModel || (merged.demandModel as any).user_type !== expectedUserType) {
    merged.demandModel = defaultDemandModel(expectedUserType);
    merged.demandResults = null;
  }

  return merged;
}

function loadPersisted(): PersistedPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPayload;
    if (data?.v !== 1 || !data.state) return null;
    return { ...data, state: normalizePlannerState(data.state) };
  } catch {
    return null;
  }
}

function formatSavedTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function scoreProblem(s: PlannerState): number {
  let x = 0;
  if (s.problem.statement.trim().length >= 40) x += 0.35;
  else if (s.problem.statement.trim().length > 0) x += 0.2;
  if (s.problem.useCase) x += 0.2;
  const criteria = s.problem.successCriteria.filter((c) => c.trim()).length;
  if (criteria >= 3) x += 0.25;
  else if (criteria >= 1) x += 0.15;
  if (s.problem.geographyScope.trim()) x += 0.1;
  if (s.problem.targetWindow.trim()) x += 0.1;
  return Math.min(1, x);
}

function scoreLocation(s: PlannerState): number {
  const c = getActiveLocationCandidate(s);
  let x = 0;
  if (s.projectTitle.trim()) x += 0.35;
  if ((c?.name ?? "").trim()) x += 0.35;
  if (Object.values(c?.signals ?? {}).some(Boolean)) x += 0.2;
  if (c?.boundary) x += 0.1;
  return Math.min(1, x);
}

function scoreStakeholders(s: PlannerState): number {
  const filled = s.stakeholders.filter((r) => r.name.trim()).length;
  if (filled >= 2) return 1;
  if (filled === 1) return 0.65;
  if (s.stakeholders.length > 0) return 0.25;
  return 0;
}

function scoreDemand(s: PlannerState): number {
  // Demand step is considered complete when the user explicitly runs the calculator.
  return s.demandResults ? 1 : 0;
}

function scoreAssessment(s: PlannerState): number {
  const keys = [s.assessment.technical, s.assessment.regulatory, s.assessment.commercial, s.assessment.offtake];
  const set = keys.filter(Boolean).length;
  let x = set / 4;
  if (s.assessment.notes.trim().length >= 30) x = Math.min(1, x + 0.15);
  return Math.min(1, x);
}

function scoreCapacity(s: PlannerState): number {
  const n = [s.capacity.hydrogenSafety, s.capacity.markets, s.capacity.operations, s.capacity.standards].filter(
    Boolean
  ).length;
  let x = n * 0.2;
  if (s.capacity.targetQuarter) x += 0.2;
  return Math.min(1, x);
}

function scoreExpert(s: PlannerState): number {
  const o = s.expert.objectives.trim().length;
  const q = s.expert.questions.trim().length;
  let x = 0;
  if (o >= 40) x += 0.55;
  else if (o >= 20) x += 0.35;
  else if (o > 0) x += 0.15;
  if (q >= 20) x += 0.35;
  else if (q > 0) x += 0.15;
  if (s.expert.contact) x += 0.1;
  return Math.min(1, x);
}

function scoreFeedback(s: PlannerState): number {
  const anyRoadmap = s.feedback.roadmapConnect || s.feedback.roadmapApis || s.feedback.roadmapReporting;
  const c = s.feedback.comments.trim().length;
  let x = 0;
  if (c >= 60) x += 0.7;
  else if (c >= 30) x += 0.5;
  else if (c > 0) x += 0.2;
  if (anyRoadmap) x += 0.3;
  return Math.min(1, x);
}

function computeProjectCompletion(s: PlannerState): { overall: number; perStep: number[] } {
  const perStep = [
    scoreProblem(s),
    scoreLocation(s),
    scoreStakeholders(s),
    scoreDemand(s),
    scoreAssessment(s),
    scoreCapacity(s),
    scoreExpert(s),
    scoreFeedback(s),
  ];
  const overall = Math.round((perStep.reduce((a, b) => a + b, 0) / WORKFLOW_STEP_COUNT) * 100);
  return { overall, perStep };
}

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-zinc-600";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function HydrogenPlanner() {
  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<PlannerState>(createInitialState);
  const [workflowComplete, setWorkflowComplete] = useState(false);
  const [decisions, setDecisions] = useState<DecisionLogEntry[]>([]);
  const [decisionDraft, setDecisionDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [demandIssues, setDemandIssues] = useState<ValidationIssue[]>([]);

  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");
  const versionIdFromUrl = searchParams.get("versionId");
  const startNewProject = searchParams.get("new") === "1" || searchParams.get("new") === "true";

  // Saved-project context (separate from the existing "local draft" autosave).
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [versionMeta, setVersionMeta] = useState<ProjectVersionMeta[]>([]);
  const [projectSaveStatus, setProjectSaveStatus] = useState<SaveStatus>("idle");
  const [projectLastSavedAt, setProjectLastSavedAt] = useState<Date | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const last = WORKFLOW_STEP_COUNT - 1;
  const step = WORKFLOW_STEPS[currentStep];
  const activeLocationCandidate = useMemo(() => getActiveLocationCandidate(state), [state.location]);
  const selectedOpportunityRegionId = activeLocationCandidate.regionId ?? null;
  const userType = useMemo(() => deriveUserType(state.problem.projectType), [state.problem.projectType]);
  const { overall, perStep } = useMemo(() => computeProjectCompletion(state), [state]);
  const planningProfile = useMemo(
    () =>
      derivePlanningProfile({
        useCase: state.problem.useCase,
        geographyScope: state.problem.geographyScope,
        projectType: state.problem.projectType,
        targetWindow: state.problem.targetWindow,
        constraints: state.problem.constraints as unknown as Record<
          ProfileConstraintKey,
          { status: ProfileConstraintStatus; notes?: string }
        >,
      }),
    [state.problem]
  );

  useEffect(() => {
    setState((s) => {
      if (s.demandModel.user_type === userType) return s;
      return { ...s, demandModel: defaultDemandModel(userType), demandResults: null };
    });
    setDemandIssues([]);
  }, [userType]);

  useEffect(() => {
    if (startNewProject) {
      setState(createInitialState());
      setCurrentStep(0);
      setDecisions([]);
      setWorkflowComplete(false);
      setActiveProjectId(null);
      setActiveVersionId(null);
      setVersionMeta([]);
      setProjectSaveStatus("idle");
      setProjectLastSavedAt(null);
      setHydrated(true);
      return;
    }

    if (projectIdFromUrl) {
      const snap = loadProjectVersion(projectIdFromUrl, versionIdFromUrl ?? undefined);
      if (snap) {
        setState(normalizePlannerState(snap.state));
        setCurrentStep(Math.min(last, Math.max(0, snap.currentStep)));
        setDecisions(Array.isArray(snap.decisions) ? snap.decisions : []);
        setWorkflowComplete(Boolean(snap.workflowComplete));
        setActiveProjectId(snap.projectId);
        setActiveVersionId(snap.versionId);
        setVersionMeta(listProjectVersions(snap.projectId, 10));
        setProjectLastSavedAt(snap.savedAt ? new Date(snap.savedAt) : null);
      } else {
        const p = loadPersisted();
        if (p) {
          setState(normalizePlannerState(p.state));
          setCurrentStep(Math.min(WORKFLOW_STEP_COUNT - 1, Math.max(0, p.currentStep)));
          setDecisions(Array.isArray(p.decisions) ? p.decisions : []);
          setWorkflowComplete(Boolean(p.workflowComplete));
        }
        setActiveProjectId(null);
        setActiveVersionId(null);
        setVersionMeta([]);
        setProjectLastSavedAt(null);
      }
      setHydrated(true);
      return;
    }

    const p = loadPersisted();
    if (p) {
      setState(normalizePlannerState(p.state));
      setCurrentStep(Math.min(WORKFLOW_STEP_COUNT - 1, Math.max(0, p.currentStep)));
      setDecisions(Array.isArray(p.decisions) ? p.decisions : []);
      setWorkflowComplete(Boolean(p.workflowComplete));
    }
    setActiveProjectId(null);
    setActiveVersionId(null);
    setVersionMeta([]);
    setProjectLastSavedAt(null);
    setHydrated(true);
  }, [startNewProject, projectIdFromUrl, versionIdFromUrl, last]);

  const materialProblemRef = useRef<string | null>(null);
  const materialProblemInitializedRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    const key = problemMaterialKey({
      useCase: state.problem.useCase,
      geographyScope: state.problem.geographyScope,
      projectType: state.problem.projectType,
      targetWindow: state.problem.targetWindow,
      constraints: state.problem.constraints as unknown as Record<
        ProfileConstraintKey,
        { status: ProfileConstraintStatus; notes?: string }
      >,
    });

    if (!materialProblemInitializedRef.current) {
      materialProblemInitializedRef.current = true;
      materialProblemRef.current = key;
      return;
    }

    const prevKey = materialProblemRef.current;
    if (!prevKey || prevKey === key) return;

    // Log Step 0 material changes for traceability (useCase / projectType / constraint status).
    try {
      const prev = JSON.parse(prevKey) as {
        useCase: string;
        projectType: string;
        statuses: Record<string, string>;
      };
      const next = JSON.parse(key) as {
        useCase: string;
        projectType: string;
        statuses: Record<string, string>;
      };

      const diffs: string[] = [];
      if (prev.useCase !== next.useCase) diffs.push(`useCase: ${prev.useCase || "(unset)"} → ${next.useCase || "(unset)"}`);
      if (prev.projectType !== next.projectType) diffs.push(`projectType: ${prev.projectType} → ${next.projectType}`);

      const label: Record<ProblemConstraintKey, string> = {
        gridCapacity: "grid capacity",
        permitting: "permitting",
        water: "water",
        landZoning: "land/zoning",
        community: "community",
        capexFunding: "capex/funding",
      };
      (Object.keys(label) as ProblemConstraintKey[]).forEach((k) => {
        const from = prev.statuses?.[k];
        const to = next.statuses?.[k];
        if (from && to && from !== to) diffs.push(`${label[k]}: ${from} → ${to}`);
      });

      if (diffs.length) {
        const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now()}`;
        setDecisions((d) => [{ id, text: `[Change] Step 0 updated — ${diffs.join("; ")}`, at: new Date().toISOString() }, ...d]);
      }
    } catch {
      // Ignore parse issues; key format is internal-only.
    } finally {
      materialProblemRef.current = key;
    }
  }, [hydrated, state.problem]);

  useEffect(() => {
    if (!hydrated) return;
    // Step-entry soft defaults derived from Step 0.
    if (currentStep === 1) {
      setState((s) => {
        const activeId = s.location.activeCandidateId;
        const idx = s.location.candidates.findIndex((c) => c.id === activeId);
        if (idx === -1) return s;

        const active = s.location.candidates[idx];
        const patch: Partial<LocationCandidate> = {};

        if (!active.name.trim() && planningProfile.seedLocationRegion) {
          patch.name = planningProfile.seedLocationRegion;
        }

        const anySignals = Object.values(active.signals).some(Boolean);
        if (!anySignals) {
          patch.signals = { ...active.signals, ...planningProfile.preferredSignals };
        }

        if (Object.keys(patch).length === 0) return s;
        const now = isoNow();
        const nextCandidates = [...s.location.candidates];
        nextCandidates[idx] = { ...active, ...patch, updatedAt: now };
        return { ...s, location: { ...s.location, candidates: nextCandidates } };
      });
    }

    if (currentStep === 5 && !state.capacity.targetQuarter && planningProfile.seedCapacityTargetQuarter) {
      setState((s) => ({ ...s, capacity: { ...s.capacity, targetQuarter: planningProfile.seedCapacityTargetQuarter ?? "" } }));
    }
  }, [hydrated, currentStep, planningProfile, state.capacity.targetQuarter]);

  useEffect(() => {
    if (!activeProjectId) {
      setVersionMeta([]);
      return;
    }
    setVersionMeta(listProjectVersions(activeProjectId, 10));
  }, [activeProjectId]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      try {
        const payload: PersistedPayload = {
          v: 1,
          state,
          currentStep,
          decisions,
          workflowComplete,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setSaveStatus("saved");
        setLastSavedAt(new Date());
      } catch {
        setSaveStatus("error");
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hydrated, state, currentStep, decisions, workflowComplete]);

  const goNext = () => {
    setWorkflowComplete(false);
    setCurrentStep((n) => Math.min(last, n + 1));
  };

  const finish = () => {
    setWorkflowComplete(true);
  };

  const goPrev = () => {
    setCurrentStep((n) => Math.max(0, n - 1));
  };

  const jumpToStep = (i: number) => {
    setWorkflowComplete(false);
    setCurrentStep(Math.max(0, Math.min(last, i)));
  };

  const addDecision = () => {
    const text = decisionDraft.trim();
    if (!text) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now()}`;
    setDecisions((d) => [{ id, text, at: new Date().toISOString() }, ...d]);
    setDecisionDraft("");
  };

  const removeDecision = (id: string) => {
    setDecisions((d) => d.filter((x) => x.id !== id));
  };

  const addStakeholder = () => {
    setState((s) => ({
      ...s,
      stakeholders: [
        ...s.stakeholders,
        { id: `st-${Date.now()}`, name: "", org: "", role: "industry", stance: "unknown" },
      ],
    }));
  };

  const updateStakeholder = (id: string, patch: Partial<StakeholderRow>) => {
    setState((s) => ({
      ...s,
      stakeholders: s.stakeholders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const removeStakeholder = (id: string) => {
    setState((s) => ({ ...s, stakeholders: s.stakeholders.filter((r) => r.id !== id) }));
  };

  const regionForActions = selectedOpportunityRegionId ? getRegionById(selectedOpportunityRegionId) : undefined;

  const buildNotesStarter = (regionId: string) => {
    const region = getRegionById(regionId);
    if (!region) return "";
    const gaps = region.developmentGaps?.slice(0, 4) ?? [];
    const drivers = region.opportunityDrivers?.slice(0, 3) ?? [];
    const lines = [
      `Selected region: ${region.name}`,
      "",
      "Opportunity summary:",
      region.summary,
      "",
      drivers.length ? "Top drivers:" : null,
      ...drivers.map((d) => `- ${d}`),
      "",
      gaps.length ? "Initial workplan (from gaps):" : null,
      ...gaps.map((g) => `- ${g}`),
    ].filter(Boolean);
    return lines.join("\n");
  };

  const addRegionActorsToStakeholders = () => {
    const regionId = selectedOpportunityRegionId;
    if (!regionId) return;
    const region = getRegionById(regionId);
    if (!region) return;

    const existingNames = new Set(state.stakeholders.map((s) => s.name.trim().toLowerCase()).filter(Boolean));

    const mapRole = (raw: string): StakeholderRow["role"] => {
      const r = raw.toLowerCase();
      if (r.includes("government") || r.includes("province") || r.includes("municip")) return "government";
      if (r.includes("tso") || r.includes("dso") || r.includes("utility") || r.includes("grid")) return "utility";
      if (r.includes("invest") || r.includes("finance") || r.includes("capital")) return "investor";
      if (r.includes("community") || r.includes("ngo")) return "community";
      return "industry";
    };

    const now = Date.now();
    const additions: StakeholderRow[] = [];
    region.ecosystemActors.forEach((a, i) => {
      const name = a.name.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (existingNames.has(key)) return;
      existingNames.add(key);
      additions.push({
        id: `st-${now}-${i}`,
        name,
        org: "",
        role: mapRole(a.role),
        stance: "unknown",
      });
    });

    if (additions.length === 0) return;
    setState((s) => ({ ...s, stakeholders: [...s.stakeholders, ...additions] }));
  };

  const generateWorkplanFromGaps = () => {
    const regionId = selectedOpportunityRegionId;
    if (!regionId) return;
    const region = getRegionById(regionId);
    if (!region) return;

    const nowIso = isoNow();
    const today = isoDatePlusDays(0);
    const due = isoDatePlusDays(21);

    const gapTitles = (region.developmentGaps ?? []).map((g) => g.trim()).filter(Boolean);
    if (gapTitles.length === 0) return;

    setState((s) => {
      const existingTitles = new Set((s.workplan.tasks ?? []).map((t) => t.title.trim().toLowerCase()).filter(Boolean));
      const additions: WorkplanTask[] = [];
      gapTitles.forEach((title) => {
        const key = title.toLowerCase();
        if (existingTitles.has(key)) return;
        existingTitles.add(key);
        additions.push({
          id: makeId("t-"),
          title,
          description: `Generated from Opportunity Map gaps for ${region.name}.`,
          stepSlug: "location",
          category: "data",
          status: "todo",
          owner: "",
          startDate: today,
          dueDate: due,
          dependsOnIds: [],
          evidenceLinks: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      });
      if (additions.length === 0) return s;
      return { ...s, workplan: { ...s.workplan, tasks: [...additions, ...s.workplan.tasks] } };
    });

    const existingLogs = new Set(decisions.map((d) => d.text));
    const newEntries: DecisionLogEntry[] = gapTitles
      .map((title) => `[Workplan] Task created — ${title}`)
      .filter((text) => !existingLogs.has(text))
      .map((text) => ({ id: makeId("d-"), text, at: nowIso }));
    if (newEntries.length) setDecisions((d) => [...newEntries, ...d]);
  };

  const addProblemMilestone = () => {
    const text = state.problem.statement.trim();
    if (!text) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now()}`;
    const useCase = state.problem.useCase ? `Use case: ${state.problem.useCase}` : "Use case: (not set)";
    setDecisions((d) => [
      { id, text: `[Milestone] Problem definition locked. ${useCase}`, at: new Date().toISOString() },
      ...d,
    ]);
  };

  const generateInitialWorkplanFromConstraints = () => {
    const constraints = state.problem.constraints;
    const nowIso = isoNow();
    const today = isoDatePlusDays(0);
    const due = isoDatePlusDays(14);

    const items: Array<{ title: string; description: string }> = [];
    const add = (label: string, notes: string) => {
      const title = `Validate ${label}`;
      const description = notes.trim() ? `Constraint notes: ${notes.trim()}` : "";
      items.push({ title, description });
    };
    if (constraints.gridCapacity.status !== "confirmed") add("grid capacity", constraints.gridCapacity.notes);
    if (constraints.permitting.status !== "confirmed") add("permitting pathway", constraints.permitting.notes);
    if (constraints.water.status !== "confirmed") add("water access", constraints.water.notes);
    if (constraints.landZoning.status !== "confirmed") add("land / zoning fit", constraints.landZoning.notes);
    if (constraints.community.status !== "confirmed") add("community acceptance", constraints.community.notes);
    if (constraints.capexFunding.status !== "confirmed") add("capex / funding envelope", constraints.capexFunding.notes);

    if (items.length === 0) return;

    setState((s) => {
      const existingTitles = new Set((s.workplan.tasks ?? []).map((t) => t.title.trim().toLowerCase()).filter(Boolean));
      const additions: WorkplanTask[] = [];
      items.forEach((it) => {
        const key = it.title.toLowerCase();
        if (existingTitles.has(key)) return;
        existingTitles.add(key);
        additions.push({
          id: makeId("t-"),
          title: it.title,
          description: it.description,
          stepSlug: "problem",
          category: "workplan",
          status: "todo",
          owner: "",
          startDate: today,
          dueDate: due,
          dependsOnIds: [],
          evidenceLinks: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      });
      if (additions.length === 0) return s;
      return { ...s, workplan: { ...s.workplan, tasks: [...additions, ...s.workplan.tasks] } };
    });

    const existingLogs = new Set(decisions.map((d) => d.text));
    const newEntries: DecisionLogEntry[] = items
      .map((it) => `[Workplan] Task created — ${it.title}`)
      .filter((text) => !existingLogs.has(text))
      .map((text) => ({ id: makeId("d-"), text, at: nowIso }));
    if (newEntries.length) setDecisions((d) => [...newEntries, ...d]);
  };

  const canContinueFromProblem =
    state.problem.statement.trim().length >= 20 &&
    Boolean(state.problem.useCase) &&
    Boolean(state.problem.geographyScope.trim()) &&
    state.problem.successCriteria.some((c) => c.trim().length > 0);

  const handleFooterNext = () => {
    if (currentStep === last) {
      finish();
      return;
    }
    if (currentStep === 0) {
      if (!canContinueFromProblem) return;
      generateInitialWorkplanFromConstraints();
      goNext();
      return;
    }
    goNext();
  };

  const createProjectSnapshot = (): ProjectSnapshot => ({
    state,
    currentStep,
    decisions,
    workflowComplete,
  });

  const formatNowLabel = () =>
    new Date().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

  const refreshVersionsForActive = (pid: string | null) => {
    if (!pid) return setVersionMeta([]);
    setVersionMeta(listProjectVersions(pid, 10));
  };

  const saveProjectSnapshot = () => {
    if (typeof window === "undefined") return;
    if (!activeProjectId) {
      saveProjectSnapshotAs();
      return;
    }
    setProjectSaveStatus("saving");
    try {
      const snapshot = createProjectSnapshot();
      const res = addProjectVersion(activeProjectId, snapshot, `Saved · ${formatNowLabel()}`);
      setActiveProjectId(res.projectId);
      setActiveVersionId(res.versionId);
      setProjectLastSavedAt(new Date());
      setProjectSaveStatus("saved");
      refreshVersionsForActive(res.projectId);
    } catch {
      setProjectSaveStatus("error");
    }
  };

  const saveProjectSnapshotAs = () => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Project name", state.projectTitle.trim() || "")?.trim();
    if (!name) return;
    setProjectSaveStatus("saving");
    try {
      const snapshot = createProjectSnapshot();
      const res = createProjectWithSnapshot(name, snapshot, `Saved · ${formatNowLabel()}`);
      setActiveProjectId(res.projectId);
      setActiveVersionId(res.versionId);
      setProjectLastSavedAt(new Date());
      setProjectSaveStatus("saved");
      refreshVersionsForActive(res.projectId);
    } catch {
      setProjectSaveStatus("error");
    }
  };

  const loadVersion = (versionId: string) => {
    if (!activeProjectId) return;
    const snap = loadProjectVersion(activeProjectId, versionId);
    if (!snap) return;
    setState(normalizePlannerState(snap.state));
    setCurrentStep(Math.min(last, Math.max(0, snap.currentStep)));
    setDecisions(Array.isArray(snap.decisions) ? snap.decisions : []);
    setWorkflowComplete(Boolean(snap.workflowComplete));
    setActiveVersionId(snap.versionId);
    setProjectSaveStatus("idle");
    setProjectLastSavedAt(snap.savedAt ? new Date(snap.savedAt) : null);
    refreshVersionsForActive(activeProjectId);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-start">
      <div className="order-1 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-950/[0.04] lg:order-2">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl bg-[#1e3a8a] px-6 py-4 text-white md:py-5">
        <h1 className="flex items-center gap-3">
          <span className="rounded-lg bg-white/95 p-1.5 shadow-sm ring-1 ring-white/30">
            <Image
              src="/branding/hyplanner-logo.png"
              alt="HyPlanner 1.0"
              width={170}
              height={34}
              priority
              className="h-7 w-auto"
            />
          </span>
          <span className="sr-only">HyPlanner 1.0</span>
        </h1>
        <Link
          href={activeProjectId ? `/planner/gantt?projectId=${encodeURIComponent(activeProjectId)}${activeVersionId ? `&versionId=${encodeURIComponent(activeVersionId)}` : ""}` : "/planner/gantt"}
          className="shrink-0 rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Gantt chart
        </Link>
      </header>

      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Project</p>
          <p className="truncate text-sm font-semibold text-zinc-900 md:text-base">
            {state.projectTitle.trim() || "Untitled project"}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            User type · <span className="text-zinc-700">{formatUserTypeLabel(userType)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-zinc-500">
          {saveStatus === "saving" && <span className="text-zinc-600">Saving draft…</span>}
          {saveStatus === "saved" && lastSavedAt && (
            <span className="text-emerald-700">Draft saved · {formatSavedTime(lastSavedAt)}</span>
          )}
          {saveStatus === "error" && <span className="text-red-600">Could not save locally</span>}
          {saveStatus === "idle" && hydrated && <span className="text-zinc-400">Local draft</span>}

          <div className="mt-2 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveProjectSnapshot}
                disabled={projectSaveStatus === "saving"}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Save
              </button>
              <button
                type="button"
                onClick={saveProjectSnapshotAs}
                disabled={projectSaveStatus === "saving"}
                className="rounded-lg bg-[#f97316] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Save As
              </button>
            </div>

            {activeProjectId && versionMeta.length > 0 ? (
              <label className="flex items-center gap-2">
                <span className="sr-only">Project version</span>
                <select
                  className="w-[220px] rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 shadow-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
                  value={activeVersionId ?? versionMeta[0]?.versionId ?? ""}
                  onChange={(e) => loadVersion(e.target.value)}
                >
                  {versionMeta.map((v) => (
                    <option key={v.versionId} value={v.versionId}>
                      {v.savedAt ? new Date(v.savedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : v.versionId}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              projectSaveStatus === "saved" && projectLastSavedAt && (
                <span className="text-emerald-700">Project saved · {formatSavedTime(projectLastSavedAt)}</span>
              )
            )}

            {projectSaveStatus === "saving" && <span className="text-zinc-600">Saving project…</span>}
            {projectSaveStatus === "error" && <span className="text-red-600">Could not save project</span>}
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">Project completion</p>
            <p className="text-2xl font-semibold tabular-nums text-zinc-900">{overall}%</p>
          </div>
          <p className="font-mono text-xs text-zinc-500">
            Step {currentStep + 1} of {WORKFLOW_STEP_COUNT}
          </p>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-valuenow={overall} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-700 to-emerald-600 transition-all duration-300"
            style={{ width: `${overall}%` }}
          />
        </div>
        <div className="mt-2 flex gap-0.5" role="presentation" aria-hidden>
          {perStep.map((p, i) => (
            <div
              key={WORKFLOW_STEPS[i].slug}
              className="h-1.5 min-w-0 flex-1 rounded-sm bg-zinc-200"
              title={`${WORKFLOW_STEPS[i].title}: ${Math.round(p * 100)}%`}
            >
              <div
                className={`h-full rounded-sm transition-colors ${p >= 0.85 ? "bg-emerald-600" : p >= 0.35 ? "bg-amber-500" : "bg-transparent"}`}
                style={{ width: `${Math.round(p * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      <nav
        className="overflow-x-auto border-b border-zinc-200 px-4 pt-4 md:px-6"
        aria-label="Workflow steps overview"
      >
        <ol className="grid min-w-[720px] grid-cols-8 gap-1 text-center text-[9px] font-medium sm:text-[10px] md:min-w-0 md:gap-2 md:text-xs">
          {WORKFLOW_STEPS.map((s, i) => {
            const active = i === currentStep;
            const muted = i > currentStep;
            const done = i < currentStep;
            return (
              <li key={s.slug} className="flex min-w-0 flex-col items-center px-0.5">
                <span className={muted ? "text-zinc-400" : "text-[#1e3a8a]"} aria-current={active ? "step" : undefined}>
                  <WorkflowStepIcon variant={i} className={`mx-auto h-7 w-7 md:h-8 md:w-8 ${muted ? "opacity-45" : ""}`} />
                </span>
                <span className={`mt-1 line-clamp-3 leading-tight ${muted ? "text-zinc-400" : "text-[#1e3a8a]"}`}>
                  {s.displayId} · {s.title.split(" ").slice(0, 2).join(" ")}
                  {s.title.split(" ").length > 2 ? "…" : ""}
                </span>
                {active && (
                  <span className="mt-2 hidden h-0.5 w-full max-w-[3rem] rounded-full bg-gradient-to-r from-[#1e3a8a] to-orange-500 sm:block" />
                )}
                {done && !active && <span className="mt-2 font-mono text-[9px] text-emerald-600">Done</span>}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="px-4 py-5 md:px-6 md:py-6">
        <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
          <span className="font-mono text-sm text-zinc-400">{step.displayId}</span>
          <h2 className="text-xl font-bold text-[#1e3a8a] md:text-2xl">{step.title}</h2>
        </div>
        {step.tool && (
          <p className={`mt-1 font-mono text-xs ${step.accentTool ? "text-orange-600" : "text-sky-700"}`}>{step.tool}</p>
        )}
        <p className="mt-2 text-sm text-zinc-600 md:text-base">{step.shortDescription}</p>

        <div className="mt-4 space-y-3" aria-live="polite" aria-atomic="true">
          {workflowComplete && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              Workflow marked complete. Your draft remains in this browser (localStorage) until you clear site data or we
              add cloud sync.
            </p>
          )}
        </div>

        <div className="mt-5">
          {currentStep === 0 && (
            <div className="space-y-4">
              <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 md:p-5">
                <legend className="px-1 text-sm font-semibold text-zinc-800">Problem statement</legend>
                <label className="mt-2 block">
                  <span className={labelClass}>What hydrogen challenge are you solving?</span>
                  <textarea
                    className={`${inputClass} min-h-[140px] resize-y`}
                    value={state.problem.statement}
                    onChange={(e) => setState((s) => ({ ...s, problem: { ...s.problem, statement: e.target.value } }))}
                    placeholder="Describe the challenge, context, and why now (2–5 sentences)."
                  />
                </label>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Primary use case</span>
                    <select
                      className={inputClass}
                      value={state.problem.useCase}
                      onChange={(e) => setState((s) => ({ ...s, problem: { ...s.problem, useCase: e.target.value } }))}
                    >
                      <option value="">Select…</option>
                      <option value="mobility">Mobility / heavy transport</option>
                      <option value="industrial-heat">Industrial heat / process</option>
                      <option value="refining-chemicals">Refining / chemicals</option>
                      <option value="ammonia-efuels">Ammonia / e-fuels</option>
                      <option value="power">Power / balancing</option>
                      <option value="export-hub">Export hub / port logistics</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Secondary use cases (comma-separated)</span>
                    <input
                      className={inputClass}
                      value={state.problem.secondaryUseCases.join(", ")}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          problem: {
                            ...s.problem,
                            secondaryUseCases: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          },
                        }))
                      }
                      placeholder="e.g. industry, mobility"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addProblemMilestone}
                    disabled={!state.problem.statement.trim()}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save milestone
                  </button>
                </div>
              </fieldset>

              <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 md:p-5">
                <legend className="px-1 text-sm font-semibold text-amber-900">Scope, success & constraints</legend>

                <label className="mt-2 block">
                  <span className={labelClass}>Success criteria (bullets)</span>
                  <div className="mt-2 space-y-2">
                    {state.problem.successCriteria.map((val, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          className={inputClass}
                          value={val}
                          onChange={(e) =>
                            setState((s) => {
                              const next = [...s.problem.successCriteria];
                              next[idx] = e.target.value;
                              return { ...s, problem: { ...s.problem, successCriteria: next } };
                            })
                          }
                          placeholder={idx === 0 ? "e.g. Signed LOIs with 2 offtakers" : "Add another criterion"}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setState((s) => ({
                              ...s,
                              problem: {
                                ...s.problem,
                                successCriteria: s.problem.successCriteria.filter((_, i) => i !== idx),
                              },
                            }))
                          }
                          disabled={state.problem.successCriteria.length <= 1}
                          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          problem: { ...s.problem, successCriteria: [...s.problem.successCriteria, ""] },
                        }))
                      }
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      + Add criterion
                    </button>
                  </div>
                </label>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Geography scope</span>
                    <input
                      className={inputClass}
                      value={state.problem.geographyScope}
                      onChange={(e) =>
                        setState((s) => ({ ...s, problem: { ...s.problem, geographyScope: e.target.value } }))
                      }
                      placeholder="Region, corridor, municipality…"
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Project type</span>
                    <select
                      className={inputClass}
                      value={state.problem.projectType}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          problem: { ...s.problem, projectType: e.target.value as ProblemDefinition["projectType"] },
                        }))
                      }
                    >
                      <option value="production">Production hub</option>
                      <option value="distribution">Distribution / logistics</option>
                      <option value="offtake">Offtake cluster</option>
                      <option value="corridor">Transport corridor</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Target COD / time horizon</span>
                    <input
                      className={inputClass}
                      value={state.problem.targetWindow}
                      onChange={(e) =>
                        setState((s) => ({ ...s, problem: { ...s.problem, targetWindow: e.target.value } }))
                      }
                      placeholder="e.g. 2028 Q4"
                    />
                  </label>
                </div>

                <div className="mt-6 space-y-3">
                  {(
                    [
                      ["gridCapacity", "Grid capacity"],
                      ["permitting", "Permitting / regulatory"],
                      ["water", "Water access"],
                      ["landZoning", "Land / zoning"],
                      ["community", "Community acceptance"],
                      ["capexFunding", "Capex / funding"],
                    ] as const
                  ).map(([key, title]) => (
                    <div key={key} className="rounded-lg border border-orange-200 bg-white/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">{title}</p>
                        <select
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
                          value={state.problem.constraints[key].status}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              problem: {
                                ...s.problem,
                                constraints: {
                                  ...s.problem.constraints,
                                  [key]: {
                                    ...s.problem.constraints[key],
                                    status: e.target.value as ProblemConstraintStatus,
                                  },
                                },
                              },
                            }))
                          }
                        >
                          <option value="unknown">Unknown</option>
                          <option value="risk">Risk</option>
                          <option value="confirmed">Confirmed</option>
                        </select>
                      </div>
                      <textarea
                        className="mt-2 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 shadow-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
                        rows={2}
                        value={state.problem.constraints[key].notes}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            problem: {
                              ...s.problem,
                              constraints: {
                                ...s.problem.constraints,
                                [key]: { ...s.problem.constraints[key], notes: e.target.value },
                              },
                            },
                          }))
                        }
                        placeholder="Notes, evidence, or what to validate…"
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              {!canContinueFromProblem && (
                <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  To go to Location, add a short statement (20+ characters), choose a primary use case, at least one
                  success criterion, and a geography scope. The footer action below adds constraint-based workplan items
                  and continues.
                </p>
              )}
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              {planningProfile.guidance.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2" role="status" aria-label="Problem definition guidance">
                  {planningProfile.guidance.map((g) => (
                    <div
                      key={g.title}
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        g.tone === "warn"
                          ? "border-amber-200 bg-amber-50 text-amber-950"
                          : "border-sky-200 bg-sky-50 text-sky-950"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{g.title}</p>
                      <p className="mt-1 text-xs opacity-90">{g.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-950/[0.04]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Opportunity map</p>
                    <p className="mt-1 text-sm text-zinc-600">
                      Zoom and click regions to review readiness and signals, then capture your boundary notes below.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={addRegionActorsToStakeholders}
                      disabled={!regionForActions}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Add actors → Stakeholders
                    </button>
                    <button
                      type="button"
                      onClick={generateWorkplanFromGaps}
                      disabled={!regionForActions}
                      className="rounded-lg bg-[#f97316] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Generate workplan
                    </button>
                  </div>
                </div>
                {regionForActions ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-medium text-zinc-800">
                      Selected: {regionForActions.name}
                    </span>
                    <span
                      className="rounded-md px-2 py-1 font-semibold text-white"
                      style={{
                        backgroundColor:
                          regionForActions.classification === "Emerging"
                            ? "#facc15"
                            : regionForActions.classification === "Viable"
                              ? "#22c55e"
                              : "#166534",
                      }}
                    >
                      {regionForActions.classification}
                    </span>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">Tip: click a region to populate fields and enable actions.</p>
                )}
                <div className="mt-4">
                  <HydrogenOpportunityMap
                    signals={activeLocationCandidate.signals}
                    onSelectRegion={(regionId) => {
                      const region = getRegionById(regionId);
                      if (!region) return;
                      const regionName = region.name?.trim() || "";
                      const notesStarter = buildNotesStarter(regionId);
                      setState((s) => {
                        const activeId = s.location.activeCandidateId;
                        const idx = s.location.candidates.findIndex((c) => c.id === activeId);
                        if (idx === -1) return s;
                        const active = s.location.candidates[idx];
                        const now = isoNow();
                        const nextCandidates = [...s.location.candidates];
                        nextCandidates[idx] = {
                          ...active,
                          regionId,
                          name: regionName || active.name,
                          notes: active.notes.trim().length === 0 ? notesStarter : active.notes,
                          updatedAt: now,
                        };
                        return { ...s, location: { ...s.location, candidates: nextCandidates } };
                      });
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                  <legend className="px-1 text-sm font-semibold text-zinc-800">Location shortlist</legend>
                  <p className="mt-2 text-xs text-zinc-600">
                    Compare 1–3 candidates. Pick one as active, then capture boundary + signals + rationale.
                  </p>

                  <div className="mt-4 space-y-2">
                    {state.location.candidates.map((c, idx) => {
                      const active = c.id === state.location.activeCandidateId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setState((s) => ({ ...s, location: { ...s.location, activeCandidateId: c.id } }))}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                            active
                              ? "border-sky-200 bg-sky-50 text-sky-950 ring-1 ring-sky-200"
                              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-zinc-500">#{idx + 1}</span>
                            <span className="truncate font-semibold">{c.name.trim() || "Untitled candidate"}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                            <span>{Object.values(c.signals).filter(Boolean).length} signals</span>
                            {c.boundary ? <span>Boundary: {c.boundary}</span> : <span>No boundary</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setState((s) => {
                          const now = isoNow();
                          const nextRank = s.location.candidates.length + 1;
                          const id = makeId("lc-");
                          const nextCandidate: LocationCandidate = {
                            id,
                            regionId: undefined,
                            name: "",
                            boundary: "",
                            notes: "",
                            rationale: "",
                            signals: { renewables: false, grid: false, transport: false, industry: false },
                            rank: nextRank,
                            createdAt: now,
                            updatedAt: now,
                          };
                          return {
                            ...s,
                            location: {
                              ...s.location,
                              activeCandidateId: id,
                              candidates: [...s.location.candidates, nextCandidate].map((c, i) => ({ ...c, rank: i + 1 })),
                            },
                          };
                        })
                      }
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      + Add candidate
                    </button>
                    <button
                      type="button"
                      disabled={state.location.candidates.length <= 1}
                      onClick={() =>
                        setState((s) => {
                          if (s.location.candidates.length <= 1) return s;
                          const nextCandidates = s.location.candidates
                            .filter((c) => c.id !== s.location.activeCandidateId)
                            .map((c, i) => ({ ...c, rank: i + 1 }));
                          const nextActive = nextCandidates[0]?.id ?? s.location.activeCandidateId;
                          return { ...s, location: { ...s.location, activeCandidateId: nextActive, candidates: nextCandidates } };
                        })
                      }
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove active
                    </button>
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-950/[0.04] lg:col-span-2">
                  <legend className="px-1 text-sm font-semibold text-zinc-800">Active candidate details</legend>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <label className="block lg:col-span-2">
                      <span className={labelClass}>Working project title</span>
                      <input
                        className={inputClass}
                        value={state.projectTitle}
                        onChange={(e) => setState((s) => ({ ...s, projectTitle: e.target.value }))}
                        placeholder="e.g. North Harbour H₂ valley"
                      />
                    </label>

                    <label className="block lg:col-span-2">
                      <span className={labelClass}>Candidate name / site description</span>
                      <textarea
                        className={`${inputClass} min-h-[76px] resize-y`}
                        value={activeLocationCandidate.name}
                        onChange={(e) =>
                          setState((s) => {
                            const id = s.location.activeCandidateId;
                            const idx = s.location.candidates.findIndex((c) => c.id === id);
                            if (idx === -1) return s;
                            const now = isoNow();
                            const nextCandidates = [...s.location.candidates];
                            nextCandidates[idx] = { ...nextCandidates[idx], name: e.target.value, updatedAt: now };
                            return { ...s, location: { ...s.location, candidates: nextCandidates } };
                          })
                        }
                        placeholder="Municipalities, ports, corridors, or coordinates (free text)."
                      />
                    </label>

                    <label className="block">
                      <span className={labelClass}>Study boundary</span>
                      <select
                        className={inputClass}
                        value={activeLocationCandidate.boundary}
                        onChange={(e) =>
                          setState((s) => {
                            const id = s.location.activeCandidateId;
                            const idx = s.location.candidates.findIndex((c) => c.id === id);
                            if (idx === -1) return s;
                            const now = isoNow();
                            const nextCandidates = [...s.location.candidates];
                            nextCandidates[idx] = { ...nextCandidates[idx], boundary: e.target.value, updatedAt: now };
                            return { ...s, location: { ...s.location, candidates: nextCandidates } };
                          })
                        }
                      >
                        <option value="">Select…</option>
                        <option value="50km">~50 km radius</option>
                        <option value="100km">~100 km radius</option>
                        <option value="watershed">Watershed / basin</option>
                        <option value="admin">Administrative region</option>
                        <option value="other">Other (see notes)</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className={labelClass}>Rationale</span>
                      <input
                        className={inputClass}
                        value={activeLocationCandidate.rationale}
                        onChange={(e) =>
                          setState((s) => {
                            const id = s.location.activeCandidateId;
                            const idx = s.location.candidates.findIndex((c) => c.id === id);
                            if (idx === -1) return s;
                            const now = isoNow();
                            const nextCandidates = [...s.location.candidates];
                            nextCandidates[idx] = { ...nextCandidates[idx], rationale: e.target.value, updatedAt: now };
                            return { ...s, location: { ...s.location, candidates: nextCandidates } };
                          })
                        }
                        placeholder="Why this site vs others (one sentence)."
                      />
                    </label>

                    <label className="block lg:col-span-2">
                      <span className={labelClass}>Desk notes</span>
                      <textarea
                        className={`${inputClass} min-h-[88px] resize-y`}
                        value={activeLocationCandidate.notes}
                        onChange={(e) =>
                          setState((s) => {
                            const id = s.location.activeCandidateId;
                            const idx = s.location.candidates.findIndex((c) => c.id === id);
                            if (idx === -1) return s;
                            const now = isoNow();
                            const nextCandidates = [...s.location.candidates];
                            nextCandidates[idx] = { ...nextCandidates[idx], notes: e.target.value, updatedAt: now };
                            return { ...s, location: { ...s.location, candidates: nextCandidates } };
                          })
                        }
                        placeholder="Data sources, exclusions, competing sites…"
                      />
                    </label>
                  </div>

                  <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Opportunity signals</p>
                    <p className="mt-2 text-xs text-amber-900/80">Check what is evidenced for this candidate (desk review).</p>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      {(
                        [
                          ["renewables", "Renewable generation in reach"],
                          ["grid", "Grid capacity / queue visibility"],
                          ["transport", "H₂-relevant transport corridor"],
                          ["industry", "Industrial offtake / cluster"],
                        ] as const
                      ).map(([key, lab]) => (
                        <label key={key} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-zinc-300 text-sky-700"
                            checked={activeLocationCandidate.signals[key]}
                            onChange={(e) =>
                              setState((s) => {
                                const id = s.location.activeCandidateId;
                                const idx = s.location.candidates.findIndex((c) => c.id === id);
                                if (idx === -1) return s;
                                const now = isoNow();
                                const nextCandidates = [...s.location.candidates];
                                const curr = nextCandidates[idx];
                                nextCandidates[idx] = {
                                  ...curr,
                                  signals: { ...curr.signals, [key]: e.target.checked },
                                  updatedAt: now,
                                };
                                return { ...s, location: { ...s.location, candidates: nextCandidates } };
                              })
                            }
                          />
                          <span>{lab}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-600">Register who must stay aligned before commitments harden.</p>
                <button
                  type="button"
                  onClick={addStakeholder}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  + Add stakeholder
                </button>
              </div>
              {state.stakeholders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                  No rows yet. Add industry, government, community, capital, or utility contacts.
                </p>
              ) : (
                <ul className="space-y-3">
                  {state.stakeholders.map((row) => (
                    <li key={row.id} className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block sm:col-span-2">
                          <span className={labelClass}>Name</span>
                          <input
                            className={inputClass}
                            value={row.name}
                            onChange={(e) => updateStakeholder(row.id, { name: e.target.value })}
                            placeholder="Contact or org lead"
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className={labelClass}>Organization</span>
                          <input
                            className={inputClass}
                            value={row.org}
                            onChange={(e) => updateStakeholder(row.id, { org: e.target.value })}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Role</span>
                          <select
                            className={inputClass}
                            value={row.role}
                            onChange={(e) => updateStakeholder(row.id, { role: e.target.value })}
                          >
                            <option value="industry">Industry / offtaker</option>
                            <option value="government">Government</option>
                            <option value="community">Community / NGO</option>
                            <option value="investor">Investor / finance</option>
                            <option value="utility">Utility / TSO</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className={labelClass}>Stance</span>
                          <select
                            className={inputClass}
                            value={row.stance}
                            onChange={(e) => updateStakeholder(row.id, { stance: e.target.value })}
                          >
                            <option value="unknown">Unknown</option>
                            <option value="supportive">Supportive</option>
                            <option value="neutral">Neutral</option>
                            <option value="opposed">Opposed</option>
                          </select>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStakeholder(row.id)}
                        className="mt-3 text-xs font-medium text-red-700 hover:underline"
                      >
                        Remove row
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                <legend className="px-1 text-sm font-semibold text-zinc-800">Calculator inputs</legend>

                <p className="mt-2 text-xs text-zinc-600">
                  Inputs shown here are driven by your Step 00 user type. Results update only when you click{" "}
                  <span className="font-semibold">Run calculator</span>.
                </p>

                {state.demandModel.user_type === "offtake_cluster" && (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>Annual natural gas consumption</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.annual_natural_gas_consumption)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                annual_natural_gas_consumption: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                          placeholder="e.g. 120000"
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Unit</span>
                        <select
                          className={inputClass}
                          value={state.demandModel.annual_natural_gas_consumption_unit ?? "MWh"}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                annual_natural_gas_consumption_unit: e.target.value as any,
                              } as DemandModelInput,
                            }))
                          }
                        >
                          <option value="m3">m³</option>
                          <option value="kWh">kWh</option>
                          <option value="MWh">MWh</option>
                          <option value="GWh">GWh</option>
                        </select>
                      </label>
                    </div>

                    <label className="mt-4 block">
                      <span className={labelClass}>Replacement percentage (0–1)</span>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={finiteNumberFieldValue(state.demandModel.replacement_percentage)}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            demandModel: {
                              ...s.demandModel,
                              replacement_percentage: parseOptionalFloat(e.target.value),
                            } as DemandModelInput,
                          }))
                        }
                        placeholder="e.g. 0.3"
                      />
                    </label>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>Period start (year)</span>
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          value={finiteNumberFieldValue(state.demandModel.global.period_start)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                global: {
                                  ...s.demandModel.global,
                                  period_start: parseOptionalInt(e.target.value),
                                },
                              } as DemandModelInput,
                            }))
                          }
                          placeholder="e.g. 2026"
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Period end (year)</span>
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          value={finiteNumberFieldValue(state.demandModel.global.period_end)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                global: {
                                  ...s.demandModel.global,
                                  period_end: parseOptionalInt(e.target.value),
                                },
                              } as DemandModelInput,
                            }))
                          }
                          placeholder="e.g. 2030"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>CO₂ price scenario</span>
                        <select
                          className={inputClass}
                          value={state.demandModel.global.co2_price_scenario ?? "Medium"}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                global: { ...s.demandModel.global, co2_price_scenario: e.target.value as any },
                              } as DemandModelInput,
                            }))
                          }
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="All">All</option>
                        </select>
                      </label>
                    </div>
                  </>
                )}

                {state.demandModel.user_type === "production_hub" && (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>Hydrogen type</span>
                        <select
                          className={inputClass}
                          value={state.demandModel.global.hydrogen_type ?? "Green"}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                global: { ...s.demandModel.global, hydrogen_type: e.target.value as "Blue" | "Green" },
                              } as DemandModelInput,
                            }))
                          }
                        >
                          <option value="Green">Green</option>
                          <option value="Blue">Blue</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelClass}>Tag year (optional)</span>
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          value={finiteNumberFieldValue(state.demandModel.global.period_start)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                global: {
                                  ...s.demandModel.global,
                                  period_start: parseOptionalInt(e.target.value),
                                },
                              } as DemandModelInput,
                            }))
                          }
                          placeholder={String(new Date().getFullYear())}
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>
                          Grid electricity (EUR/MWh) — optional; adds variable €/kg for Green when set
                        </span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.annual_electricity_price_eur_per_MWh)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                annual_electricity_price_eur_per_MWh: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                          placeholder="e.g. 85"
                        />
                      </label>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>Electrolyzer capacity (MW)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.electrolyzer_capacity_MW)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                electrolyzer_capacity_MW: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Reformer capacity (MW)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.reformer_capacity_MW)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                reformer_capacity_MW: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Capacity factor (0–1)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.capacity_factor)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: { ...s.demandModel, capacity_factor: parseOptionalFloat(e.target.value) } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Efficiency (kWh/kg)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.efficiency_kWh_per_kg)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                efficiency_kWh_per_kg: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Annualized capex (EUR/year)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.capex)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: { ...s.demandModel, capex: parseOptionalFloat(e.target.value) } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Annual opex (EUR/year)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.opex)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: { ...s.demandModel, opex: parseOptionalFloat(e.target.value) } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </>
                )}

                {state.demandModel.user_type === "distribution_logistics" && (
                  <>
                    <label className="mt-4 block">
                      <span className={labelClass}>Hydrogen volume input method</span>
                      <select
                        className={inputClass}
                        value={state.demandModel.hydrogen_volume_input_method ?? "from_demand"}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            demandModel: { ...s.demandModel, hydrogen_volume_input_method: e.target.value as any } as DemandModelInput,
                          }))
                        }
                      >
                        <option value="from_production">From production</option>
                        <option value="from_demand">From demand</option>
                      </select>
                    </label>
                    {state.demandModel.hydrogen_volume_input_method === "from_production" && (
                      <p className="mt-2 text-xs text-zinc-600">
                        {(() => {
                          const pr = state.demandResults;
                          const kg =
                            pr?.user_type === "production_hub" &&
                            typeof pr.summary_metrics?.annual_hydrogen_production_kg === "number"
                              ? (pr.summary_metrics.annual_hydrogen_production_kg as number)
                              : NaN;
                          if (Number.isFinite(kg) && kg > 0) {
                            return (
                              <>
                                Linked to last <span className="font-semibold">Production hub</span> run:{" "}
                                {formatNumber(kg, { maximumFractionDigits: 0 })} kg/yr (applied when you Run).
                              </>
                            );
                          }
                          return "Run Production hub in this step first and keep its results, then Run distribution.";
                        })()}
                      </p>
                    )}
                    <label className="mt-4 block">
                      <span className={labelClass}>Tag year (optional)</span>
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        value={finiteNumberFieldValue(state.demandModel.global.period_start)}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            demandModel: {
                              ...s.demandModel,
                              global: {
                                ...s.demandModel.global,
                                period_start: parseOptionalInt(e.target.value),
                              },
                            } as DemandModelInput,
                          }))
                        }
                        placeholder={String(new Date().getFullYear())}
                      />
                    </label>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>
                          {state.demandModel.hydrogen_volume_input_method === "from_production"
                            ? "Hydrogen mass (kg, from production)"
                            : "Hydrogen input (kg)"}
                        </span>
                        <input
                          className={`${inputClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                          inputMode="decimal"
                          disabled={state.demandModel.hydrogen_volume_input_method === "from_production"}
                          value={
                            state.demandModel.hydrogen_volume_input_method === "from_production"
                              ? (() => {
                                  const pr = state.demandResults;
                                  const kg =
                                    pr?.user_type === "production_hub" &&
                                    typeof pr.summary_metrics?.annual_hydrogen_production_kg === "number"
                                      ? (pr.summary_metrics.annual_hydrogen_production_kg as number)
                                      : NaN;
                                  return Number.isFinite(kg) && kg > 0 ? kg : "";
                                })()
                              : finiteNumberFieldValue(state.demandModel.hydrogen_input_value_kg)
                          }
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                hydrogen_input_value_kg: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Distance (km)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.transport_distance_km)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                transport_distance_km: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Transport mode</span>
                        <select
                          className={inputClass}
                          value={state.demandModel.transport_mode ?? "truck"}
                          onChange={(e) =>
                            setState((s) => ({ ...s, demandModel: { ...s.demandModel, transport_mode: e.target.value as any } as DemandModelInput }))
                          }
                        >
                          <option value="truck">Truck</option>
                          <option value="pipeline">Pipeline</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelClass}>Cost per km per kg</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.cost_per_km_per_kg)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                cost_per_km_per_kg: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </>
                )}

                {state.demandModel.user_type === "transport_corridor" && (
                  <>
                    <label className="mt-4 block">
                      <span className={labelClass}>Tag year (optional)</span>
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        value={finiteNumberFieldValue(state.demandModel.global.period_start)}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            demandModel: {
                              ...s.demandModel,
                              global: {
                                ...s.demandModel.global,
                                period_start: parseOptionalInt(e.target.value),
                              },
                            } as DemandModelInput,
                          }))
                        }
                        placeholder={String(new Date().getFullYear())}
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className={labelClass}>Node demands (kg, comma-separated)</span>
                      <input
                        className={inputClass}
                        value={(state.demandModel.node_demands_kg ?? []).join(", ")}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            demandModel: {
                              ...s.demandModel,
                              node_demands_kg: e.target.value
                                .split(",")
                                .map((x) => parseFloat(x.trim()))
                                .filter((x) => Number.isFinite(x)),
                            } as DemandModelInput,
                          }))
                        }
                        placeholder="e.g. 5000, 12000, 8000"
                      />
                    </label>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>Avg distance between nodes</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.average_distance_between_nodes)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                average_distance_between_nodes: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Cost per km per kg</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.cost_per_km_per_kg)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                cost_per_km_per_kg: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>Loss factor (0–0.49, optional)</span>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={finiteNumberFieldValue(state.demandModel.loss_factor)}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              demandModel: {
                                ...s.demandModel,
                                loss_factor: parseOptionalFloat(e.target.value),
                              } as DemandModelInput,
                            }))
                          }
                          placeholder="0"
                        />
                        <span className="mt-1 block text-[11px] text-zinc-500">
                          Share lost in transit; cost uses kg moved = delivered ÷ (1 − loss).
                        </span>
                      </label>
                    </div>
                  </>
                )}

                {demandIssues.length > 0 && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                    <p className="font-semibold">Missing / invalid inputs</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {demandIssues.map((i, idx) => (
                        <li key={idx}>
                          <span className="font-medium">{i.field}</span>: {i.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDemandIssues([]);
                      const modelToRun = buildDemandModelForRun(state);
                      if (
                        state.demandModel.user_type === "distribution_logistics" &&
                        state.demandModel.hydrogen_volume_input_method === "from_production"
                      ) {
                        const pr = state.demandResults;
                        const kg =
                          pr?.user_type === "production_hub" &&
                          typeof pr.summary_metrics?.annual_hydrogen_production_kg === "number"
                            ? (pr.summary_metrics.annual_hydrogen_production_kg as number)
                            : NaN;
                        if (!Number.isFinite(kg) || kg <= 0) {
                          setDemandIssues([
                            {
                              field: "from_production",
                              message:
                                "Run Production hub in this session first (keep results), or switch to From demand and enter kg.",
                            },
                          ]);
                          return;
                        }
                      }
                      const issues = validateDemandModel(modelToRun);
                      setDemandIssues(issues);
                      if (issues.length > 0) return;
                      const result = computeDemandModel(modelToRun);
                      setState((s) => ({ ...s, demandResults: result }));
                    }}
                    className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
                  >
                    Run calculator
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDemandIssues([]);
                      setState((s) => ({ ...s, demandResults: null }));
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Clear results
                  </button>
                </div>
              </fieldset>

              <fieldset className="rounded-xl border border-orange-200/90 bg-gradient-to-b from-orange-50/60 via-amber-50/25 to-white p-5 shadow-sm">
                <legend className="px-1 text-sm font-semibold text-amber-950">Outputs</legend>
                {state.demandResults ? (
                  <div className="mt-2 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orange-200/70 pb-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-orange-800/90">Latest run</p>
                        <p className="mt-0.5 text-base font-semibold text-zinc-900">
                          {formatUserTypeLabel(state.demandResults.user_type)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-orange-500/15 px-3 py-1 text-xs font-semibold text-orange-950 ring-1 ring-orange-300/40">
                        Desk calculator
                      </span>
                    </div>

                    {state.demandResults.user_type === "offtake_cluster" && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <DemandKpiCard
                            label="Gas consumption"
                            value={`${formatNumber((state.demandResults.summary_metrics as any).natural_gas_volume_MWh, {
                              maximumFractionDigits: 0,
                            })} MWh`}
                            hint="Annual volume, converted to MWh"
                            emphasis="lead"
                          />
                          <DemandKpiCard
                            label="Replaceable gas"
                            value={`${formatNumber((state.demandResults.summary_metrics as any).replaceable_volume_MWh, {
                              maximumFractionDigits: 0,
                            })} MWh`}
                            hint="After replacement %"
                          />
                          <DemandKpiCard
                            label="Avoided CO₂"
                            value={`${formatNumber((state.demandResults.summary_metrics as any).avoided_co2_ton, {
                              maximumFractionDigits: 1,
                            })} t/yr`}
                          />
                          <DemandKpiCard
                            label="H₂ substitution"
                            value={`${formatNumber((state.demandResults.summary_metrics as any).hydrogen_ton_per_year, {
                              maximumFractionDigits: 1,
                            })} t/yr`}
                            hint="Desk link from replaceable MWh"
                          />
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-semibold text-zinc-700">Year × CO₂ price scenario</p>
                          <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm">
                            <div className="max-h-[min(420px,55vh)] overflow-auto">
                              <table className="min-w-[600px] w-full text-left text-sm">
                                <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-zinc-100/90 shadow-[0_1px_0_0_rgb(228_228_231)]">
                                  <tr>
                                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                      Year
                                    </th>
                                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                      Scenario
                                    </th>
                                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                      H₂ (t)
                                    </th>
                                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                      CO₂ savings / yr
                                    </th>
                                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                      Cumulative
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {state.demandResults.yearly_results.map((row, idx) => {
                                    const scenario = (row.scenario as string | undefined) ?? "—";
                                    return (
                                      <tr
                                        key={idx}
                                        className="bg-white transition-colors hover:bg-orange-50/40 even:bg-zinc-50/50"
                                      >
                                        <td className="whitespace-nowrap px-4 py-2.5 font-medium tabular-nums text-zinc-900">
                                          {row.year as any}
                                        </td>
                                        <td className="px-4 py-2.5">
                                          <span
                                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${demandScenarioBadgeClass(scenario)}`}
                                          >
                                            {scenario}
                                          </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-800">
                                          {formatNumber((row.hydrogen_ton as any) ?? undefined, { maximumFractionDigits: 1 })}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900">
                                          {formatCurrencyEUR((row.co2_cost_savings_eur as any) ?? undefined)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-700">
                                          {formatCurrencyEUR((row.cumulative_co2_cost_savings_eur as any) ?? undefined)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {state.demandResults.user_type === "production_hub" && (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <DemandKpiCard
                          label="Annual H₂ production"
                          value={`${formatNumber((state.demandResults.summary_metrics as any).annual_hydrogen_production_kg, {
                            maximumFractionDigits: 0,
                          })} kg`}
                          hint="From capacity, CF, and efficiency"
                          emphasis="lead"
                        />
                        <DemandKpiCard
                          label="Levelized cost"
                          value={`${formatNumber((state.demandResults.summary_metrics as any).hydrogen_cost_per_kg, {
                            maximumFractionDigits: 3,
                          })} €/kg`}
                          hint="Fixed + variable (Green)"
                        />
                        <DemandKpiCard
                          label="Fixed cost"
                          value={`${formatNumber((state.demandResults.summary_metrics as any).fixed_cost_eur_per_kg, {
                            maximumFractionDigits: 3,
                          })} €/kg`}
                          hint="Annualized capex + opex"
                        />
                        <DemandKpiCard
                          label="Variable cost"
                          value={`${formatNumber((state.demandResults.summary_metrics as any).variable_cost_eur_per_kg, {
                            maximumFractionDigits: 3,
                          })} €/kg`}
                          hint="Grid power (if set)"
                        />
                      </div>
                    )}

                    {state.demandResults.user_type === "distribution_logistics" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <DemandKpiCard
                          label="Mass moved"
                          value={`${formatNumber((state.demandResults.summary_metrics as any).transported_hydrogen_kg, {
                            maximumFractionDigits: 0,
                          })} kg`}
                          hint="Per run basis"
                          emphasis="lead"
                        />
                        <DemandKpiCard
                          label="Transport cost"
                          value={formatCurrencyEUR((state.demandResults.summary_metrics as any).transport_cost)}
                          hint="kg × km × €/km/kg"
                        />
                      </div>
                    )}

                    {state.demandResults.user_type === "transport_corridor" && (
                      <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-3">
                        <DemandKpiCard
                          label="Delivered demand"
                          value={`${formatNumber(
                            (state.demandResults.summary_metrics as any).total_hydrogen_demand_kg ??
                              (state.demandResults.summary_metrics as any).total_hydrogen_demand,
                            { maximumFractionDigits: 0 },
                          )} kg`}
                          hint="Sum of node demands"
                          emphasis="lead"
                        />
                        <DemandKpiCard
                          label="Shipped mass (incl. loss)"
                          value={`${formatNumber((state.demandResults.summary_metrics as any).transport_basis_kg, {
                            maximumFractionDigits: 0,
                          })} kg`}
                          hint="Delivered ÷ (1 − loss)"
                        />
                        <DemandKpiCard
                          label="Network transport cost"
                          value={formatCurrencyEUR((state.demandResults.summary_metrics as any).total_network_transport_cost)}
                          hint="Shipped kg × avg km × €/km/kg"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-orange-300/70 bg-orange-50/25 py-14 px-6 text-center">
                    <p className="text-sm font-semibold text-amber-950">No results yet</p>
                    <p className="mt-2 max-w-sm text-xs leading-relaxed text-amber-900/85">
                      Fill in the calculator on the left, then click <span className="font-semibold text-amber-950">Run calculator</span>{" "}
                      to populate this panel.
                    </p>
                  </div>
                )}
              </fieldset>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              {planningProfile.guidance.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2" role="status" aria-label="Problem definition guidance">
                  {planningProfile.guidance.map((g) => (
                    <div
                      key={g.title}
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        g.tone === "warn"
                          ? "border-amber-200 bg-amber-50 text-amber-950"
                          : "border-sky-200 bg-sky-50 text-sky-950"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{g.title}</p>
                      <p className="mt-1 text-xs opacity-90">{g.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                  <legend className="px-1 text-sm font-semibold text-zinc-800">Business case inputs</legend>
                  <p className="mt-2 text-xs text-zinc-600">Minimal desk model: Year 0 capex, then flat revenue &amp; opex.</p>

                  <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-zinc-300 text-orange-600"
                      checked={state.businessCase.revenue_linked_to_step3}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          businessCase: { ...s.businessCase, revenue_linked_to_step3: e.target.checked },
                        }))
                      }
                    />
                    <span className="leading-snug">
                      <span className="font-semibold text-zinc-900">Link revenue</span>{" "}
                      <span className="text-zinc-600">from Step 3 results (kg/yr × price)</span>
                    </span>
                  </label>

                  {state.businessCase.revenue_linked_to_step3 && (
                    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 px-4 py-3 text-xs text-amber-950">
                      {(() => {
                        const kg = getHydrogenKgPerYearFromDemandResults(state.demandResults);
                        if (!kg) {
                          return (
                            <p className="leading-relaxed">
                              No Step 3 results to link yet. Run the Step 3 calculator first, or uncheck linking to enter revenue manually.
                            </p>
                          );
                        }
                        return (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">Source:</span>
                            <span>{state.demandResults ? formatUserTypeLabel(state.demandResults.user_type) : "—"}</span>
                            <span className="text-zinc-400">•</span>
                            <span className="font-semibold">Hydrogen:</span>
                            <span className="tabular-nums">{formatNumber(kg, { maximumFractionDigits: 0 })} kg/yr</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClass}>Project years</span>
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        value={finiteNumberFieldValue(state.businessCase.project_years)}
                        onChange={(e) => {
                          const n = parseOptionalInt(e.target.value);
                          setState((s) => ({
                            ...s,
                            businessCase: { ...s.businessCase, project_years: Math.max(0, Math.floor(n ?? 0)) },
                          }));
                        }}
                        placeholder="e.g. 15"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Discount rate (decimal)</span>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={finiteNumberFieldValue(state.businessCase.discount_rate)}
                        onChange={(e) => {
                          const n = parseOptionalFloat(e.target.value);
                          setState((s) => ({ ...s, businessCase: { ...s.businessCase, discount_rate: n ?? 0 } }));
                        }}
                        placeholder="e.g. 0.08"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Capex (EUR, Year 0)</span>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={finiteNumberFieldValue(state.businessCase.capex_eur)}
                        onChange={(e) => {
                          const n = parseOptionalFloat(e.target.value);
                          setState((s) => ({ ...s, businessCase: { ...s.businessCase, capex_eur: n ?? 0 } }));
                        }}
                        placeholder="e.g. 20000000"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Revenue (EUR/year)</span>
                      <input
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                        inputMode="decimal"
                        value={finiteNumberFieldValue(state.businessCase.revenue_eur_per_year)}
                        disabled={state.businessCase.revenue_linked_to_step3}
                        onChange={(e) => {
                          const n = parseOptionalFloat(e.target.value);
                          setState((s) => ({ ...s, businessCase: { ...s.businessCase, revenue_eur_per_year: n ?? 0 } }));
                        }}
                        placeholder="e.g. 6000000"
                      />
                      {state.businessCase.revenue_linked_to_step3 && (
                        <span className="mt-1 block text-[11px] text-zinc-500">
                          Revenue is derived from hydrogen kg/yr × price (set below).
                        </span>
                      )}
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Opex (EUR/year)</span>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={finiteNumberFieldValue(state.businessCase.opex_eur_per_year)}
                        onChange={(e) => {
                          const n = parseOptionalFloat(e.target.value);
                          setState((s) => ({ ...s, businessCase: { ...s.businessCase, opex_eur_per_year: n ?? 0 } }));
                        }}
                        placeholder="e.g. 2500000"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Hydrogen sales price (EUR/kg)</span>
                      <input
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                        inputMode="decimal"
                        value={finiteNumberFieldValue(state.businessCase.hydrogen_price_eur_per_kg)}
                        disabled={!state.businessCase.revenue_linked_to_step3}
                        onChange={(e) => {
                          const n = parseOptionalFloat(e.target.value);
                          setState((s) => ({ ...s, businessCase: { ...s.businessCase, hydrogen_price_eur_per_kg: n ?? 0 } }));
                        }}
                        placeholder="e.g. 6.5"
                      />
                      {!state.businessCase.revenue_linked_to_step3 && (
                        <span className="mt-1 block text-[11px] text-zinc-500">
                          Enable linking to use hydrogen price in revenue calculation.
                        </span>
                      )}
                    </label>
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-orange-200/90 bg-gradient-to-b from-orange-50/60 via-amber-50/25 to-white p-5 shadow-sm">
                  <legend className="px-1 text-sm font-semibold text-amber-950">Business case outputs</legend>
                  {(() => {
                    const bc = state.businessCase;
                    const years = Math.max(0, Math.floor(bc.project_years || 0));
                    const linkedKg = getHydrogenKgPerYearFromDemandResults(state.demandResults);
                    const derivedRevenue =
                      bc.revenue_linked_to_step3 && linkedKg
                        ? linkedKg * (bc.hydrogen_price_eur_per_kg ?? 0)
                        : bc.revenue_eur_per_year ?? 0;
                    const revenueUsed = bc.revenue_linked_to_step3 ? derivedRevenue : bc.revenue_eur_per_year ?? 0;
                    const opexUsed = bc.opex_eur_per_year ?? 0;
                    const annualNet = revenueUsed - opexUsed;
                    const capex0 = Math.max(0, bc.capex_eur ?? 0);

                    const safeDiscountRate = bc.discount_rate !== undefined && bc.discount_rate > -0.999 ? bc.discount_rate : 0;
                    const cashflows: CashFlow[] = [{ net_cash_flow: -capex0 }];
                    for (let y = 1; y <= years; y += 1) cashflows.push({ net_cash_flow: annualNet });

                    const payback = calculatePaybackPeriod(cashflows);
                    const discPayback = calculateDiscountedPaybackPeriod(cashflows, safeDiscountRate);
                    const npvValue = npv(safeDiscountRate, cashflows.map((c) => c.net_cash_flow));
                    const irrValue = irr(cashflows.map((c) => c.net_cash_flow));

                    return (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <DemandKpiCard
                            label="Annual net cashflow"
                            value={formatCurrencyEUR(annualNet)}
                            hint={bc.revenue_linked_to_step3 ? "Linked revenue − opex" : "Revenue − opex"}
                            emphasis="lead"
                          />
                          <DemandKpiCard label="NPV" value={formatCurrencyEUR(npvValue)} hint="Discounted at the rate above" />
                          <DemandKpiCard
                            label="Payback"
                            value={`${payback[0]}y ${payback[1]}m`}
                            hint="Undiscounted (desk interpolation)"
                          />
                          <DemandKpiCard
                            label="Discounted payback"
                            value={`${discPayback[0]}y ${discPayback[1]}m`}
                            hint="Discounted cashflows"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <DemandKpiCard label="IRR" value={formatPercent(irrValue, { maximumFractionDigits: 1 })} hint="Best-effort bisection" />
                          <div className="rounded-xl border border-zinc-200/85 bg-white p-4 text-xs text-zinc-600">
                            <p className="font-semibold text-zinc-800">Cashflow definition</p>
                            <p className="mt-2 leading-relaxed">
                              Year 0 = <span className="font-medium text-zinc-900">−capex</span>. Years 1..N ={" "}
                              <span className="font-medium text-zinc-900">revenue − opex</span>.
                            </p>
                            {bc.revenue_linked_to_step3 && (
                              <p className="mt-2 leading-relaxed">
                                Linked revenue ={" "}
                                <span className="font-medium text-zinc-900">
                                  {formatNumber(linkedKg ?? undefined, { maximumFractionDigits: 0 })} kg/yr
                                </span>{" "}
                                ×{" "}
                                <span className="font-medium text-zinc-900">
                                  {formatNumber(bc.hydrogen_price_eur_per_kg ?? 0, { maximumFractionDigits: 3 })} €/kg
                                </span>{" "}
                                = <span className="font-medium text-zinc-900">{formatCurrencyEUR(derivedRevenue)}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </fieldset>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                  <legend className="px-1 text-sm font-semibold text-zinc-800">Gate scores</legend>
                  <p className="mt-2 text-xs text-zinc-600">Low / medium / high confidence for each dimension.</p>
                  {(
                    [
                      ["technical", "Technical feasibility"],
                      ["regulatory", "Regulatory path"],
                      ["commercial", "Commercial viability"],
                      ["offtake", "Offtake clarity"],
                    ] as const
                  ).map(([key, lab]) => (
                    <label key={key} className="mt-4 block">
                      <span className={labelClass}>{lab}</span>
                      <select
                        className={inputClass}
                        value={state.assessment[key]}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            assessment: { ...s.assessment, [key]: e.target.value },
                          }))
                        }
                      >
                        <option value="">Select…</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
                  <legend className="px-1 text-sm font-semibold text-amber-900">Gate decision</legend>
                  <label className="mt-2 block">
                    <span className={labelClass}>Notes (go / iterate / park)</span>
                    <textarea
                      className={`${inputClass} min-h-[200px] resize-y`}
                      value={state.assessment.notes}
                      onChange={(e) =>
                        setState((s) => ({ ...s, assessment: { ...s.assessment, notes: e.target.value } }))
                      }
                      placeholder="Document rationale, dependencies, and what would change the call."
                    />
                  </label>
                </fieldset>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                <legend className="px-1 text-sm font-semibold text-zinc-800">Training tracks</legend>
                <div className="mt-4 space-y-3 text-sm">
                  {(
                    [
                      ["hydrogenSafety", "H₂ safety & operations"],
                      ["markets", "Markets & offtake"],
                      ["operations", "Electrolysis / logistics basics"],
                      ["standards", "Standards & certification"],
                    ] as const
                  ).map(([key, lab]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-zinc-300 text-sky-700"
                        checked={state.capacity[key]}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            capacity: { ...s.capacity, [key]: e.target.checked },
                          }))
                        }
                      />
                      <span>{lab}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
                <legend className="px-1 text-sm font-semibold text-amber-900">Schedule</legend>
                <label className="mt-4 block">
                  <span className={labelClass}>Target completion window</span>
                  <select
                    className={inputClass}
                    value={state.capacity.targetQuarter}
                    onChange={(e) =>
                      setState((s) => ({ ...s, capacity: { ...s.capacity, targetQuarter: e.target.value } }))
                    }
                  >
                    <option value="">Select…</option>
                    <option value="q1">Next quarter</option>
                    <option value="h1">Next 2 quarters</option>
                    <option value="fy">This fiscal year</option>
                    <option value="12m">Rolling 12 months</option>
                  </select>
                </label>
                <p className="mt-4 text-xs text-amber-900/90">
                  Tie tracks to roles in the stakeholder register; LMS hooks can replace this checklist later.
                </p>
              </fieldset>
            </div>
          )}

          {currentStep === 6 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                <legend className="px-1 text-sm font-semibold text-zinc-800">Review scope</legend>
                <label className="mt-2 block">
                  <span className={labelClass}>Objectives for expert review</span>
                  <textarea
                    className={`${inputClass} min-h-[120px] resize-y`}
                    value={state.expert.objectives}
                    onChange={(e) =>
                      setState((s) => ({ ...s, expert: { ...s.expert, objectives: e.target.value } }))
                    }
                    placeholder="What decisions should this review unblock? Be specific."
                  />
                </label>
                <label className="mt-4 block">
                  <span className={labelClass}>Questions / hypotheses</span>
                  <textarea
                    className={`${inputClass} min-h-[120px] resize-y`}
                    value={state.expert.questions}
                    onChange={(e) =>
                      setState((s) => ({ ...s, expert: { ...s.expert, questions: e.target.value } }))
                    }
                  />
                </label>
              </fieldset>
              <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
                <legend className="px-1 text-sm font-semibold text-amber-900">Logistics</legend>
                <label className="mt-2 block">
                  <span className={labelClass}>Preferred follow-up</span>
                  <select
                    className={inputClass}
                    value={state.expert.contact}
                    onChange={(e) =>
                      setState((s) => ({ ...s, expert: { ...s.expert, contact: e.target.value } }))
                    }
                  >
                    <option value="email">Email summary</option>
                    <option value="call">Video call</option>
                    <option value="workshop">Half-day workshop</option>
                  </select>
                </label>
                <div className="mt-6 rounded-lg border border-dashed border-orange-300 bg-white/60 p-4 text-xs text-orange-900">
                  Attachments (brief, GIS excerpt, demand sheet) can wire to storage later—note filenames in objectives
                  for now.
                </div>
              </fieldset>
            </div>
          )}

          {currentStep === 7 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                <legend className="px-1 text-sm font-semibold text-zinc-800">Roadmap priorities</legend>
                <p className="mt-2 text-xs text-zinc-600">Signal what to fund or build next.</p>
                <div className="mt-4 space-y-3 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-zinc-300 text-orange-600"
                      checked={state.feedback.roadmapConnect}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          feedback: { ...s.feedback, roadmapConnect: e.target.checked },
                        }))
                      }
                    />
                    <span>Deeper stakeholder & data integrations</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-zinc-300 text-orange-600"
                      checked={state.feedback.roadmapApis}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          feedback: { ...s.feedback, roadmapApis: e.target.checked },
                        }))
                      }
                    />
                    <span>APIs & audit trail for assessments</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-zinc-300 text-orange-600"
                      checked={state.feedback.roadmapReporting}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          feedback: { ...s.feedback, roadmapReporting: e.target.checked },
                        }))
                      }
                    />
                    <span>Reporting pack for investors / grants</span>
                  </label>
                </div>
              </fieldset>
              <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
                <legend className="px-1 text-sm font-semibold text-amber-900">Structured feedback</legend>
                <label className="mt-2 block">
                  <span className={labelClass}>What worked / what to improve</span>
                  <textarea
                    className={`${inputClass} min-h-[200px] resize-y`}
                    value={state.feedback.comments}
                    onChange={(e) =>
                      setState((s) => ({ ...s, feedback: { ...s.feedback, comments: e.target.value } }))
                    }
                    placeholder="Friction points, missing data, regulatory surprises, feature requests…"
                  />
                </label>
              </fieldset>
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-col-reverse gap-3 border-t border-zinc-100 px-4 py-5 sm:flex-row sm:justify-between md:px-6">
        <button
          type="button"
          disabled={currentStep === 0}
          onClick={goPrev}
          className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-[#1e3a8a] transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
        >
          Previous Step
        </button>
        <button
          type="button"
          onClick={handleFooterNext}
          disabled={currentStep === 0 && !canContinueFromProblem}
          className="rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {currentStep === last ? "Finish" : currentStep === 0 ? "Next: Location (workplan) →" : "Next Step →"}
        </button>
      </footer>
    </div>
    <aside className="order-2 w-full shrink-0 space-y-4 lg:order-1 lg:w-56 lg:sticky lg:top-4 lg:self-start">
        <nav
          className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-950/[0.04]"
          aria-label="Jump to step"
        >
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Workflow</p>
          <ul className="mt-2 space-y-1">
            {WORKFLOW_STEPS.map((s, i) => {
              const active = i === currentStep;
              const pct = Math.round(perStep[i] * 100);
              return (
                <li key={s.slug}>
                  <button
                    type="button"
                    onClick={() => jumpToStep(i)}
                    className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      active ? "bg-sky-50 text-sky-950 ring-1 ring-sky-200" : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <span className="font-medium leading-snug">
                      {s.displayId} {s.title}
                    </span>
                    <span className="text-[10px] tabular-nums text-zinc-500">Filled · {pct}%</span>
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-zinc-200">
                      <span
                        className={`block h-full rounded-full ${pct >= 85 ? "bg-emerald-500" : pct >= 35 ? "bg-amber-500" : "bg-zinc-300"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-950/[0.04]">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Assumptions and decisions
          </p>
          <p className="mt-1 px-1 text-[11px] leading-relaxed text-zinc-500">
            Record gates, risks, and agreed calls. Newest entries appear first.
          </p>
          <textarea
            className="mt-2 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 shadow-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
            value={decisionDraft}
            onChange={(e) => setDecisionDraft(e.target.value)}
            placeholder="Decision, assumption, or risk…"
            rows={3}
          />
          <button
            type="button"
            onClick={addDecision}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-zinc-50 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
          >
            Add to log
          </button>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
            {decisions.map((entry) => (
              <li key={entry.id} className="rounded-md border border-zinc-100 bg-zinc-50/80 p-2">
                <p className="whitespace-pre-wrap text-zinc-800">{entry.text}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <time className="font-mono text-[10px] text-zinc-400" dateTime={entry.at}>
                    {new Date(entry.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </time>
                  <button
                    type="button"
                    onClick={() => removeDecision(entry.id)}
                    className="text-[10px] font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
