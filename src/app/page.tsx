export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-slate-400">
            Plumber
          </p>

          <h1 className="text-5xl font-semibold tracking-tight">
            Personal finance tracking, built properly.
          </h1>

          <p className="mt-6 text-lg leading-8 text-slate-300">
            Track accounts, transactions, budgets, investments, net worth, and
            eventually SAT-backed tax data in one scalable web app.
          </p>

          <div className="mt-10 flex gap-4">
            <a
              href="/dashboard"
              className="rounded-lg bg-white px-5 py-3 text-sm font-medium text-slate-950"
            >
              Open dashboard
            </a>

            <a
              href="https://github.com/jhinojosp/plumber"
              className="rounded-lg border border-slate-700 px-5 py-3 text-sm font-medium text-white"
            >
              View repo
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
