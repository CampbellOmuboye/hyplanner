"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { WORKFLOW_STEPS, WORKFLOW_STEP_COUNT } from "@/lib/hyplanner-workflow";
import { WorkflowStepIcon } from "./WorkflowStepIcon";

const STORAGE_KEY = "hyplanner.project.v1";

type StakeholderRow = { id: string; name: string; org: string; role: string; stance: string };

export type PlannerState = {
  projectTitle: string;
  location: {
    region: string;
    boundary: string;
    notes: string;
    signals: { renewables: boolean; grid: boolean; transport: boolean; industry: boolean };
  };
  stakeholders: StakeholderRow[];
  demand: { baselineTPerYear: string; scenario: string; sector: string; assumptions: string };
  assessment: { technical: string; regulatory: string; commercial: string; offtake: string; notes: string };
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

function createInitialState(): PlannerState {
  return {
    projectTitle: "",
    location: {
      region: "",
      boundary: "",
      notes: "",
      signals: { renewables: false, grid: false, transport: false, industry: false },
    },
    stakeholders: [],
    demand: { baselineTPerYear: "", scenario: "mid", sector: "", assumptions: "" },
    assessment: { technical: "", regulatory: "", commercial: "", offtake: "", notes: "" },
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

function loadPersisted(): PersistedPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPayload;
    if (data?.v !== 1 || !data.state) return null;
    return data;
  } catch {
    return null;
  }
}

function formatSavedTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function scoreLocation(s: PlannerState): number {
  let x = 0;
  if (s.projectTitle.trim()) x += 0.35;
  if (s.location.region.trim()) x += 0.35;
  if (Object.values(s.location.signals).some(Boolean)) x += 0.2;
  if (s.location.boundary) x += 0.1;
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

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const last = WORKFLOW_STEP_COUNT - 1;
  const step = WORKFLOW_STEPS[currentStep];
  const { overall, perStep } = useMemo(() => computeProjectCompletion(state), [state]);

  useEffect(() => {
    const p = loadPersisted();
    if (p) {
      setState(p.state);
      setCurrentStep(Math.min(WORKFLOW_STEP_COUNT - 1, Math.max(0, p.currentStep)));
      setDecisions(Array.isArray(p.decisions) ? p.decisions : []);
      setWorkflowComplete(Boolean(p.workflowComplete));
    }
    setHydrated(true);
  }, []);

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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-start">
      <div className="order-1 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-950/[0.04] lg:order-2">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl bg-[#1e3a8a] px-6 py-4 text-white md:py-5">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">HyPlanner 1.0</h1>
        <Link
          href="/planner/gantt"
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
          {saveStatus === "saving" && <span className="text-zinc-600">Saving…</span>}
          {saveStatus === "saved" && lastSavedAt && (
            <span className="text-emerald-700">Saved · {formatSavedTime(lastSavedAt)}</span>
          )}
          {saveStatus === "error" && <span className="text-red-600">Could not save locally</span>}
          {saveStatus === "idle" && hydrated && <span className="text-zinc-400">Local draft</span>}
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
        <ol className="grid min-w-[640px] grid-cols-7 gap-1 text-center text-[9px] font-medium sm:text-[10px] md:min-w-0 md:gap-2 md:text-xs">
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

      <div className="px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
          <span className="font-mono text-sm text-zinc-400">{step.displayId}</span>
          <h2 className="text-xl font-bold text-[#1e3a8a] md:text-2xl">{step.title}</h2>
        </div>
        {step.tool && (
          <p className={`mt-1 font-mono text-xs ${step.accentTool ? "text-orange-600" : "text-sky-700"}`}>{step.tool}</p>
        )}
        <p className="mt-2 text-sm text-zinc-600 md:text-base">{step.shortDescription}</p>

        <div
          className="mt-4 min-h-[3rem] space-y-3"
          aria-live="polite"
          aria-atomic="true"
        >
          {workflowComplete && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              Workflow marked complete. Your draft remains in this browser (localStorage) until you clear site data or we
              add cloud sync.
            </p>
          )}
        </div>

        <div className="mt-6">
          {currentStep === 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
                <legend className="px-1 text-sm font-semibold text-zinc-800">Site & boundary</legend>
                <label className="mt-4 block">
                  <span className={labelClass}>Working project title</span>
                  <input
                    className={inputClass}
                    value={state.projectTitle}
                    onChange={(e) => setState((s) => ({ ...s, projectTitle: e.target.value }))}
                    placeholder="e.g. North Harbour H₂ valley"
                  />
                </label>
                <label className="mt-4 block">
                  <span className={labelClass}>Region / site description</span>
                  <textarea
                    className={`${inputClass} min-h-[88px] resize-y`}
                    value={state.location.region}
                    onChange={(e) => setState((s) => ({ ...s, location: { ...s.location, region: e.target.value } }))}
                    placeholder="Municipalities, ports, corridors, or coordinates (free text)."
                  />
                </label>
                <label className="mt-4 block">
                  <span className={labelClass}>Study boundary</span>
                  <select
                    className={inputClass}
                    value={state.location.boundary}
                    onChange={(e) => setState((s) => ({ ...s, location: { ...s.location, boundary: e.target.value } }))}
                  >
                    <option value="">Select…</option>
                    <option value="50km">~50 km radius</option>
                    <option value="100km">~100 km radius</option>
                    <option value="watershed">Watershed / basin</option>
                    <option value="admin">Administrative region</option>
                    <option value="other">Other (see notes)</option>
                  </select>
                </label>
                <label className="mt-4 block">
                  <span className={labelClass}>Desk notes</span>
                  <textarea
                    className={`${inputClass} min-h-[72px] resize-y`}
                    value={state.location.notes}
                    onChange={(e) => setState((s) => ({ ...s, location: { ...s.location, notes: e.target.value } }))}
                    placeholder="Data sources, exclusions, competing sites…"
                  />
                </label>
              </fieldset>
              <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
                <legend className="px-1 text-sm font-semibold text-amber-900">Opportunity signals</legend>
                <p className="mt-2 text-xs text-amber-900/80">Check what is evidenced for this geography (desk review).</p>
                <div className="mt-4 space-y-3 text-sm">
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
                        checked={state.location.signals[key]}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            location: {
                              ...s.location,
                              signals: { ...s.location.signals, [key]: e.target.checked },
                            },
                          }))
                        }
                      />
                      <span>{lab}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-6 rounded-lg border border-dashed border-orange-300 bg-white/60 p-4 text-center text-xs text-orange-800">
                  GIS overlay and scored layers can plug in here later; for now capture signals above.
                </div>
              </fieldset>
            </div>
          )}

          {currentStep === 1 && (
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

          {currentStep === 2 && (
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

          {currentStep === 3 && (
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
          )}

          {currentStep === 4 && (
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

          {currentStep === 5 && (
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

          {currentStep === 6 && (
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
          onClick={currentStep === last ? finish : goNext}
          className="rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
        >
          {currentStep === last ? "Finish" : "Next Step →"}
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
