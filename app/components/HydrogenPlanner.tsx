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
  assessment: { technical: string; regulatory: string; commercial: string; offtake: string; notes: string };
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
    assessment: { technical: "", regulatory: "", commercial: "", offtake: "", notes: "" },
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
    capacity: { ...base.capacity, ...(raw.capacity ?? base.capacity) },
    expert: { ...base.expert, ...(raw.expert ?? base.expert) },
    feedback: { ...base.feedback, ...(raw.feedback ?? base.feedback) },
    stakeholders: Array.isArray(raw.stakeholders) ? raw.stakeholders : [],
    location: base.location,
    workplan: base.workplan,
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
  const n = parseFloat(s.demand.baselineTPerYear.replace(",", "."));
  let x = 0;
  if (!Number.isNaN(n) && n > 0) x += 0.45;
  if (s.demand.sector) x += 0.35;
  if (s.demand.scenario) x += 0.1;
  if (s.demand.assumptions.trim().length >= 20) x += 0.1;
  return Math.min(1, x);
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
                <legend className="px-1 text-sm font-semibold text-zinc-800">Demand parameters</legend>
                <label className="mt-2 block">
                  <span className={labelClass}>Baseline H₂ demand (t/yr)</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={state.demand.baselineTPerYear}
                    onChange={(e) => setState((s) => ({ ...s, demand: { ...s.demand, baselineTPerYear: e.target.value } }))}
                    placeholder="e.g. 5000"
                  />
                </label>
                <label className="mt-4 block">
                  <span className={labelClass}>Scenario band</span>
                  <select
                    className={inputClass}
                    value={state.demand.scenario}
                    onChange={(e) => setState((s) => ({ ...s, demand: { ...s.demand, scenario: e.target.value } }))}
                  >
                    <option value="low">Low</option>
                    <option value="mid">Mid</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="mt-4 block">
                  <span className={labelClass}>Primary sector</span>
                  <select
                    className={inputClass}
                    value={state.demand.sector}
                    onChange={(e) => setState((s) => ({ ...s, demand: { ...s.demand, sector: e.target.value } }))}
                  >
                    <option value="">Select…</option>
                    <option value="mobility">Mobility</option>
                    <option value="industry">Industry / refining</option>
                    <option value="power">Power / balancing</option>
                    <option value="blend">Grid injection / blend</option>
                    <option value="export">Export / hub</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </fieldset>
              <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
                <legend className="px-1 text-sm font-semibold text-amber-900">Assumptions & sensitivity</legend>
                <label className="mt-2 block">
                  <span className={labelClass}>Assumptions log</span>
                  <textarea
                    className={`${inputClass} min-h-[160px] resize-y`}
                    value={state.demand.assumptions}
                    onChange={(e) =>
                      setState((s) => ({ ...s, demand: { ...s.demand, assumptions: e.target.value } }))
                    }
                    placeholder="Load factors, substitution rates, import parity, policy instruments…"
                  />
                </label>
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
