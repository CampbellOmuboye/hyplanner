import Link from "next/link";

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200/80 bg-white/95 px-6 backdrop-blur">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-neutral-900"
        >
          Opportunity Atlas
        </Link>
        <nav>
          <Link
            href="/map"
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            Map
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            Spatial infrastructure opportunity intelligence
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-neutral-600">
            Understand where energy transition infrastructure can be developed and why—driven by geography, policy, and ecosystem signals.
          </p>
          <div className="mt-10">
            <Link
              href="/map"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Explore the map
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-24 grid max-w-3xl gap-8 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Opportunity lens
            </h2>
            <p className="mt-2 text-neutral-700">
              Regions classified by readiness—Emerging, Viable, and Investable—for hydrogen and related infrastructure.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Strategic context
            </h2>
            <p className="mt-2 text-neutral-700">
              Readiness scores, infrastructure signals, and ecosystem actors for each region—all in one view.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
