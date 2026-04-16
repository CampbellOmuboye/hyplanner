import type { PlannerState } from "@/app/components/HydrogenPlanner";

export type DecisionLogEntry = { id: string; text: string; at: string };

export type ProjectSnapshot = {
  state: PlannerState;
  currentStep: number;
  decisions: DecisionLogEntry[];
  workflowComplete: boolean;
};

export type SavedProject = {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  latestVersionId: string | null;
  latestSavedAt: string | null;
  versionCount: number;
};

export type ProjectVersionMeta = {
  versionId: string;
  savedAt: string;
  label?: string;
  currentStep: number;
  workflowComplete: boolean;
};

const PROJECTS_STORAGE_KEY = "hyplanner.projects.v1";

type ProjectsStorageV1 = {
  schemaVersion: 1;
  projects: Array<{
    projectId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    versions: Array<{
      versionId: string;
      savedAt: string;
      label?: string;
      currentStep: number;
      workflowComplete: boolean;
      decisions: DecisionLogEntry[];
      state: PlannerState;
    }>;
  }>;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParseProjects(raw: string | null): ProjectsStorageV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectsStorageV1;
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readStorage(): ProjectsStorageV1 {
  if (!canUseStorage()) return { schemaVersion: 1, projects: [] };
  const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
  const parsed = safeParseProjects(raw);
  return parsed ?? { schemaVersion: 1, projects: [] };
}

function writeStorage(next: ProjectsStorageV1) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
}

function generateId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function") {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now()}`;
}

function getLatestVersion(project: ProjectsStorageV1["projects"][number]) {
  return project.versions.length > 0 ? project.versions[0] : null; // we store newest first
}

function normalizeProjectName(name: string) {
  const n = name.trim();
  return n.length > 0 ? n : "Untitled project";
}

export function listSavedProjectsLatest(): SavedProject[] {
  if (!canUseStorage()) return [];
  const store = readStorage();
  return store.projects
    .map((p) => {
      const latest = getLatestVersion(p);
      return {
        projectId: p.projectId,
        name: p.name,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        latestVersionId: latest?.versionId ?? null,
        latestSavedAt: latest?.savedAt ?? null,
        versionCount: p.versions.length,
      };
    })
    .sort((a, b) => {
      const at = a.latestSavedAt ? new Date(a.latestSavedAt).getTime() : 0;
      const bt = b.latestSavedAt ? new Date(b.latestSavedAt).getTime() : 0;
      return bt - at;
    });
}

export function listProjectVersions(projectId: string, limit = 10): ProjectVersionMeta[] {
  if (!canUseStorage()) return [];
  const store = readStorage();
  const p = store.projects.find((x) => x.projectId === projectId);
  if (!p) return [];
  return p.versions.slice(0, limit).map((v) => ({
    versionId: v.versionId,
    savedAt: v.savedAt,
    label: v.label,
    currentStep: v.currentStep,
    workflowComplete: v.workflowComplete,
  }));
}

export function loadProjectVersion(
  projectId: string,
  versionId?: string
): {
  projectId: string;
  versionId: string;
  state: PlannerState;
  currentStep: number;
  decisions: DecisionLogEntry[];
  workflowComplete: boolean;
  savedAt: string;
  label?: string;
} | null {
  if (!canUseStorage()) return null;
  const store = readStorage();
  const p = store.projects.find((x) => x.projectId === projectId);
  if (!p) return null;
  const v =
    (versionId ? p.versions.find((x) => x.versionId === versionId) : null) ??
    getLatestVersion(p);
  if (!v) return null;
  return {
    projectId,
    versionId: v.versionId,
    state: v.state,
    currentStep: v.currentStep,
    decisions: v.decisions,
    workflowComplete: v.workflowComplete,
    savedAt: v.savedAt,
    label: v.label,
  };
}

function upsertProjectAndSaveVersion(args: {
  projectId: string;
  name: string;
  snapshot: ProjectSnapshot;
  label?: string;
}): { projectId: string; versionId: string } {
  const store = readStorage();
  const now = new Date();
  const versionId = generateId("v-");
  const newVersion = {
    versionId,
    savedAt: now.toISOString(),
    label: args.label,
    currentStep: args.snapshot.currentStep,
    workflowComplete: args.snapshot.workflowComplete,
    decisions: args.snapshot.decisions,
    state: args.snapshot.state,
  };

  const idx = store.projects.findIndex((p) => p.projectId === args.projectId);
  if (idx === -1) {
    store.projects.unshift({
      projectId: args.projectId,
      name: normalizeProjectName(args.name),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      versions: [newVersion],
    });
    writeStorage(store);
    return { projectId: args.projectId, versionId };
  }

  const p = store.projects[idx];
  const updated = {
    ...p,
    name: normalizeProjectName(args.name) || p.name,
    updatedAt: now.toISOString(),
    versions: [newVersion, ...p.versions],
  };
  store.projects.splice(idx, 1, updated);
  writeStorage(store);
  return { projectId: updated.projectId, versionId };
}

export function createProjectWithSnapshot(
  name: string,
  snapshot: ProjectSnapshot,
  label?: string
): { projectId: string; versionId: string } {
  const projectId = generateId("p-");
  return upsertProjectAndSaveVersion({
    projectId,
    name,
    snapshot,
    label,
  });
}

export function addProjectVersion(
  projectId: string,
  snapshot: ProjectSnapshot,
  label?: string
): { projectId: string; versionId: string } {
  const store = readStorage();
  const p = store.projects.find((x) => x.projectId === projectId);
  const name = p?.name ?? snapshot.state.projectTitle?.trim() ?? "Untitled project";
  return upsertProjectAndSaveVersion({
    projectId,
    name,
    snapshot,
    label,
  });
}

