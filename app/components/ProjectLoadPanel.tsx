"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listSavedProjectsLatest } from "@/lib/hyplanner-projects-storage";
import type { SavedProject } from "@/lib/hyplanner-projects-storage";

function formatSavedAt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ProjectLoadPanel() {
  const router = useRouter();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProjects(listSavedProjectsLatest());
    setHydrated(true);
  }, []);

  const load = (p: SavedProject) => {
    if (!p.latestVersionId) {
      router.push(`/planner?projectId=${encodeURIComponent(p.projectId)}`);
      return;
    }
    router.push(
      `/planner?projectId=${encodeURIComponent(p.projectId)}&versionId=${encodeURIComponent(p.latestVersionId)}`
    );
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Saved projects</p>
          <p className="mt-1 text-xs text-zinc-500">Load the latest saved snapshot (with versions available in the planner).</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setProjects(listSavedProjectsLatest());
          }}
          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      {!hydrated ? (
        <p className="mt-4 text-sm text-zinc-500">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No saved projects yet. Create one using `Save` in the planner.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {projects.map((p) => (
            <div key={p.projectId} className="rounded-lg border border-zinc-100 bg-zinc-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">{p.name}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {p.latestSavedAt ? formatSavedAt(p.latestSavedAt) : "Not saved yet"} · {p.versionCount} versions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => load(p)}
                  className="rounded-lg bg-[#f97316] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
                >
                  Load
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

