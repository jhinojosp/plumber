const metrics = [
  {
    label: "Monthly income",
    value: "$0",
  },
  {
    label: "Monthly expenses",
    value: "$0",
  },
  {
    label: "Estimated savings",
    value: "$0",
  },
  {
    label: "Net worth",
    value: "$0",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">
            Plumber
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Initial financial overview. Data will connect to Supabase in the
            next sprints.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{metric.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">
                {metric.value}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Recent transactions
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            No transactions yet. This table will be connected after we create
            the database schema.
          </p>
        </section>
      </div>
    </main>
  );
}
