import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Plumber
          </p>

          <h1 className="text-5xl font-semibold tracking-tight">
            Personal finance tracking, built properly.
          </h1>

          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Track accounts, transactions, budgets, investments, net worth, and
            eventually SAT-backed tax data in one scalable web app.
          </p>

          <div className="mt-10 flex gap-4">
            <Button asChild>
              <a href="/dashboard">Open dashboard</a>
            </Button>

            <Button asChild variant="outline">
              <a href="https://github.com/jhinojosp/plumber">View repo</a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
