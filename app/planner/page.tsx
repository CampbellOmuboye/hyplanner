import { HydrogenPlanner } from "../components/HydrogenPlanner";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Planner",
  description: "Seven-step HyPlanner workflow: capture location, stakeholders, demand, assessment, training, expert review, and feedback.",
};

export default function PlannerPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-gradient-to-b from-zinc-100 via-zinc-50/80 to-zinc-100 px-4 py-10 font-sans antialiased sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 w-full max-w-6xl text-sm text-zinc-600">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link
              href="/"
              className="font-medium text-slate-700 underline-offset-4 transition-colors hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              Home
            </Link>
          </li>
          <li aria-hidden className="text-zinc-300">
            /
          </li>
          <li className="font-semibold tracking-tight text-zinc-900" aria-current="page">
            Planner
          </li>
        </ol>
      </nav>
      <Suspense
        fallback={
          <div className="flex w-full max-w-6xl items-center justify-center rounded-xl border border-zinc-200/80 bg-white/80 py-16 text-sm text-zinc-600 shadow-sm">
            Loading planner…
          </div>
        }
      >
        <HydrogenPlanner />
      </Suspense>
    </div>
  );
}
