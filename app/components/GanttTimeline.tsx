"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WORKFLOW_STEPS, WORKFLOW_STEP_COUNT } from "@/lib/hyplanner-workflow";
import { loadProjectVersion } from "@/lib/hyplanner-projects-storage";
import type { PlannerState, WorkplanTask } from "./HydrogenPlanner";

const STORAGE_KEY = "hyplanner.project.v1";

type Persisted = {
  v: 1;
  state: PlannerState;
  currentStep: number;
  decisions?: unknown;
  workflowComplete?: unknown;
};

function readPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (p?.v !== 1 || !p.state) return null;
    return p;
  } catch {
    return null;
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

type Zoom = "week" | "month";

export function GanttTimeline() {
  const [zoom, setZoom] = useState<Zoom>("week");
  const [projectTitle, setProjectTitle] = useState("Untitled project");
  const [tasks, setTasks] = useState<WorkplanTask[]>([]);

  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");
  const versionIdFromUrl = searchParams.get("versionId");

  useEffect(() => {
    if (projectIdFromUrl) {
      const snap = loadProjectVersion(projectIdFromUrl, versionIdFromUrl ?? undefined);
      if (snap?.state) {
        setProjectTitle(snap.state.projectTitle?.trim() || "Untitled project");
        setTasks(Array.isArray(snap.state.workplan?.tasks) ? snap.state.workplan.tasks : []);
        return;
      }
    }
    const persisted = readPersisted();
    setProjectTitle(persisted?.state?.projectTitle?.trim() || "Untitled project");
    setTasks(Array.isArray(persisted?.state?.workplan?.tasks) ? persisted!.state.workplan.tasks : []);
  }, [projectIdFromUrl, versionIdFromUrl]);

  const backHref = projectIdFromUrl
    ? `/planner?projectId=${encodeURIComponent(projectIdFromUrl)}${
        versionIdFromUrl ? `&versionId=${encodeURIComponent(versionIdFromUrl)}` : ""
      }`
    : "/planner";

  const { anchor, totalDays, rows, todayOffset, hasTaskRows } = useMemo(() => {
    const baseTotal = zoom === "week" ? 98 : 180;
    const dated = tasks
      .map((t) => ({
        t,
        start: new Date(t.startDate),
        due: new Date(t.dueDate),
      }))
      .filter((x) => !Number.isNaN(x.start.getTime()) && !Number.isNaN(x.due.getTime()));

    const minStart = dated.length ? dated.reduce((a, b) => (a.start < b.start ? a : b)).start : addDays(new Date(), -7);
    const maxDue = dated.length ? dated.reduce((a, b) => (a.due > b.due ? a : b)).due : addDays(new Date(), 30);

    const anchorDate = startOfDay(addDays(minStart, -7));
    const total = Math.max(baseTotal, diffDays(startOfDay(maxDue), anchorDate) + 14);
    const today = startOfDay(new Date());
    const tOff = Math.max(0, Math.min(100, (diffDays(today, anchorDate) / total) * 100));

    const rowData =
      dated.length > 0
        ? dated
            .slice()
            .sort((a, b) => a.due.getTime() - b.due.getTime())
            .map(({ t, start, due }) => {
              const left = (diffDays(startOfDay(start), anchorDate) / total) * 100;
              const width = (Math.max(1, diffDays(startOfDay(due), startOfDay(start))) / total) * 100;
              const stepLabel = t.stepSlug ? WORKFLOW_STEPS.find((s) => s.slug === t.stepSlug)?.displayId : undefined;
              return {
                key: t.id,
                title: t.title,
                subtitle: `${t.status.replace("_", " ")}${stepLabel ? ` · Step ${stepLabel}` : ""}`,
                left: Math.max(0, Math.min(100, left)),
                width: Math.max(1.5, Math.min(100, width)),
                isMilestone: false,
              };
            })
        : WORKFLOW_STEPS.map((step, i) => {
            const start = i * 12;
            const len = step.slug === "assessment" ? 8 : 14;
            const left = (start / total) * 100;
            const width = (len / total) * 100;
            const isMilestone = step.slug === "assessment";
            return {
              key: step.slug,
              title: step.title,
              subtitle:
                step.slug === "location"
                  ? "Site & signals"
                  : step.slug === "stakeholders"
                    ? "Stakeholder register"
                    : step.slug === "demand"
                      ? "Demand baseline"
                      : step.slug === "assessment"
                        ? "Gate review"
                        : step.slug === "capacity"
                          ? "Training window"
                          : step.slug === "expert"
                            ? "Expert review"
                            : "Feedback & roadmap",
              left,
              width,
              isMilestone,
            };
          });

    return {
      anchor: anchorDate,
      totalDays: total,
      rows: rowData,
      todayOffset: tOff,
      hasTaskRows: dated.length > 0,
    };
  }, [tasks, zoom]);

  const dayLabels = useMemo(() => {
    const n = zoom === "week" ? 14 : 6;
    const step = Math.ceil(totalDays / n);
    const labels: { d: Date; short: string }[] = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(anchor, i * step);
      labels.push({
        d,
        short: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }
    return labels;
  }, [anchor, totalDays, zoom]);

  return (
    <div className="w-full max-w-7xl font-sans text-zinc-900">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Programme timeline</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Gantt view</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Timeline is driven by your structured workplan tasks (start/due dates). If none exist yet, we fall back to
            an illustrative workflow-step schedule.
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-800">{projectTitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setZoom("week")}
              className={`rounded-md px-3 py-1.5 ${zoom === "week" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
            >
              ~14 wk
            </button>
            <button
              type="button"
              onClick={() => setZoom("month")}
              className={`rounded-md px-3 py-1.5 ${zoom === "month" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
            >
              ~6 mo
            </button>
          </div>
          <Link
            href={backHref}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            ← Back to planner
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="min-w-[720px]">
          <div className="grid border-b border-zinc-200 bg-zinc-50" style={{ gridTemplateColumns: "200px 1fr" }}>
            <div className="border-r border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Workstream
            </div>
            <div className="flex px-1 py-2">
              {dayLabels.map((lab, i) => (
                <div
                  key={i}
                  className="flex-1 border-l border-zinc-100 px-1 text-center text-[10px] font-medium text-zinc-500 first:border-l-0"
                >
                  {lab.short}
                </div>
              ))}
            </div>
          </div>

          {rows.map(({ key, left, width, isMilestone, title, subtitle }) => (
            <div
              key={key}
              className="grid border-b border-zinc-100 last:border-b-0"
              style={{ gridTemplateColumns: "200px 1fr" }}
            >
              <div className="flex items-center gap-2 border-r border-zinc-200 bg-zinc-50/50 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-900">{title}</p>
                  <p className="truncate text-[10px] text-zinc-500">{subtitle}</p>
                </div>
              </div>
              <div className="relative min-h-[48px] bg-white">
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-orange-500"
                  style={{ left: `${todayOffset}%` }}
                  title="Today"
                  aria-hidden
                />
                <div className="absolute inset-y-2 left-0 right-0">
                  {isMilestone ? (
                    <div
                      className="absolute top-1/2 z-[1] size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-orange-600 bg-white"
                      style={{ left: `${left + width}%` }}
                      title="Milestone: gate review"
                    />
                  ) : null}
                  <div
                    className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md bg-sky-600/90 shadow-sm ring-1 ring-sky-700/30"
                    style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
                    title={title}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-500">
        Orange vertical line = today · {hasTaskRows ? `${rows.length} tasks` : `${WORKFLOW_STEP_COUNT} swimlanes`} · Data
        from same browser draft as the planner
      </p>
    </div>
  );
}
