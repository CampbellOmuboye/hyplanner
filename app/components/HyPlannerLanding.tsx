import Link from "next/link";
import Image from "next/image";
import { WORKFLOW_STEPS } from "@/lib/hyplanner-workflow";
import { WorkflowStepIcon } from "./WorkflowStepIcon";
import { ProjectLoadPanel } from "./ProjectLoadPanel";

export function HyPlannerLanding() {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-zinc-900 focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-[3.25rem] sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            <Image
              src="/branding/hyplanner-logo.png"
              alt="HyPlanner 1.0"
              width={220}
              height={44}
              priority
              className="h-8 w-auto sm:h-9"
            />
            <span className="sr-only">HyPlanner</span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-3">
            <a
              href="#workflow"
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              Workflow
            </a>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <div className="border-b border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/80">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
              <header className="lg:col-span-7">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
                    <Image
                      src="/branding/hyplanner-logo.png"
                      alt="HyPlanner 1.0"
                      width={360}
                      height={72}
                      priority
                      className="h-12 w-auto sm:h-14"
                    />
                  </div>
                  <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:block">
                    Release 1.0
                  </p>
                </div>

                <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.6rem] lg:leading-tight">
                  Hydrogen valley planning, structured as software
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
                  A fixed sequence—from problem definition through location, stakeholders, demand, gates, capability,
                  expert review, and feedback—so teams stay aligned and decisions remain traceable.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {[
                    { k: "01", t: "One workflow", d: "Same steps for every project; no guesswork." },
                    { k: "02", t: "Decision log", d: "Keep assumptions and changes auditable." },
                    { k: "03", t: "Versioned saves", d: "Snapshot milestones locally as you iterate." },
                  ].map((x) => (
                    <div
                      key={x.k}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-950/[0.03]"
                    >
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{x.k}</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">{x.t}</p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-600">{x.d}</p>
                    </div>
                  ))}
                </div>
              </header>

              <aside className="lg:col-span-5">
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-950/[0.04]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Project actions</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    Start a new plan or load a versioned snapshot. Your drafts stay local in this browser.
                  </p>

                  <div className="mt-4 grid gap-3">
                    <Link
                      href="/planner?new=1"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-orange-300 bg-orange-50 px-6 py-3 text-sm font-semibold text-orange-800 shadow-sm transition-colors hover:border-orange-400 hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                    >
                      Start new project
                    </Link>

                    <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <summary className="cursor-pointer list-none rounded-lg px-2 py-2 text-sm font-semibold text-zinc-900 hover:bg-white">
                        Load saved project
                      </summary>
                      <div className="mt-3">
                        <ProjectLoadPanel />
                      </div>
                    </details>
                  </div>

                  <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What you’ll produce</p>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                      {[
                        "Problem definition and constraints register",
                        "Location signals + boundary notes (Opportunity Map)",
                        "Stakeholder register and early demand estimate",
                        "Gate decision rationale + next actions in the log",
                      ].map((x) => (
                        <li key={x} className="flex gap-2">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-700" aria-hidden />
                          <span>{x}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <section id="workflow" className="scroll-mt-24" aria-labelledby="workflow-heading">
            <div className="max-w-3xl">
              <h2 id="workflow-heading" className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                Planning workflow
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600 sm:text-base">
                Each stage produces inputs for the next: align on geography and signals, lock in actors and demand,
                score the case, build capability, seek review, then close the loop on product direction.
              </p>
            </div>

            <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              {WORKFLOW_STEPS.map((step, i) => (
                <li
                  key={step.slug}
                  className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-950/[0.04] transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-zinc-600">
                      {step.displayId}
                    </span>
                    <WorkflowStepIcon variant={i} className="h-8 w-8 shrink-0 text-zinc-500" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold leading-snug text-zinc-900">{step.title}</h3>
                  {step.tool ? (
                    <p
                      className={`mt-2 text-xs font-medium leading-snug ${
                        step.accentTool ? "text-orange-600" : "text-sky-800"
                      }`}
                    >
                      <span className="sr-only">Module: </span>
                      {step.tool}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Advisory</p>
                  )}
                  <p className="mt-4 border-l-2 border-sky-200 pl-3 text-sm leading-relaxed text-zinc-600">
                    {step.shortDescription}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row sm:items-start">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-zinc-900">HyPlanner</p>
              <p className="mt-1 text-xs text-zinc-500">Structured hydrogen valley programme planning.</p>
              <p className="mt-3 text-xs text-zinc-400">© {year} HyPlanner. All rights reserved.</p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 sm:justify-end">
              <Link
                href="#workflow"
                className="text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
              >
                Documentation
              </Link>
              <Link
                href="/planner"
                className="text-xs font-medium text-sky-800 underline-offset-4 hover:text-sky-950 hover:underline"
              >
                Planner
              </Link>
              <span className="text-xs text-zinc-400">Privacy</span>
              <span className="text-xs text-zinc-400">Terms</span>
              <span className="text-xs text-zinc-400">Contact</span>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
