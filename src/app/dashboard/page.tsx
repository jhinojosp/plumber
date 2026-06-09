import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
            Plumber
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email}. Initial financial overview. Data will
            connect to Supabase in the next sprints.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardHeader className="pb-2">
                <CardDescription>{metric.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{metric.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>
              No transactions yet. This table will be connected after we create
              the database schema.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
