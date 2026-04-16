import { GanttTimeline } from "@/app/components/GanttTimeline";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Timeline",
  description: "Programme Gantt view for the HyPlanner seven-step workflow.",
};

export default function GanttPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-zinc-100 px-4 py-8 font-sans">
      <nav aria-label="Breadcrumb" className="mb-4 w-full max-w-7xl text-sm text-zinc-600">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link
              href="/"
              className="font-medium text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              Home
            </Link>
          </li>
          <li aria-hidden className="text-zinc-400">
            /
          </li>
          <li>
            <Link
              href="/planner"
              className="font-medium text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              Planner
            </Link>
          </li>
          <li aria-hidden className="text-zinc-400">
            /
          </li>
          <li className="font-medium text-zinc-900" aria-current="page">
            Timeline
          </li>
        </ol>
      </nav>
      <Suspense fallback={<div className="text-sm text-zinc-600">Loading timeline…</div>}>
        <GanttTimeline />
      </Suspense>
    </div>
  );
}
