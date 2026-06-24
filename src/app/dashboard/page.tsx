import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);

  const [
    { data: monthlyTransactions, error: monthlyError },
    { data: allTransactions, error: allTransactionsError },
    { data: accounts, error: accountsError },
    { data: recentTransactions, error: recentError },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, transaction_type, currency")
      .neq("transaction_type", "transfer")
      .gte("date", monthStart)
      .eq("currency", "MXN"),

    supabase
      .from("transactions")
      .select("amount, currency")
      .eq("currency", "MXN"),

    supabase
      .from("accounts")
      .select("initial_balance, currency, is_active")
      .eq("currency", "MXN")
      .eq("is_active", true),

    supabase
      .from("transactions")
      .select(
        `
        id,
        date,
        description,
        amount,
        currency,
        accounts(name),
        categories(name)
      `
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const dataError =
    monthlyError || allTransactionsError || accountsError || recentError;

  const monthlyIncome =
    monthlyTransactions
      ?.filter((transaction) => Number(transaction.amount) > 0)
      .reduce(
        (total, transaction) => total + Number(transaction.amount),
        0
      ) ?? 0;

  const monthlyExpenses =
    monthlyTransactions
      ?.filter((transaction) => Number(transaction.amount) < 0)
      .reduce(
        (total, transaction) => total + Math.abs(Number(transaction.amount)),
        0
      ) ?? 0;

  const estimatedSavings = monthlyIncome - monthlyExpenses;

  const initialBalances =
    accounts?.reduce(
      (total, account) => total + Number(account.initial_balance),
      0
    ) ?? 0;

  const transactionBalances =
    allTransactions?.reduce(
      (total, transaction) => total + Number(transaction.amount),
      0
    ) ?? 0;

  const provisionalNetWorth = initialBalances + transactionBalances;

  const metrics = [
    {
      label: "Monthly income",
      value: formatCurrency(monthlyIncome),
    },
    {
      label: "Monthly expenses",
      value: formatCurrency(monthlyExpenses),
    },
    {
      label: "Estimated savings",
      value: formatCurrency(estimatedSavings),
    },
    {
      label: "Net worth",
      value: formatCurrency(provisionalNetWorth),
    },
  ];

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="mt-2 text-muted-foreground">
              Signed in as {user.email}. Metrics currently include MXN only.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/accounts">Accounts</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/categories">Categories</Link>
            </Button>
            <Button asChild>
              <Link href="/transactions">Add transaction</Link>
            </Button>
          </div>
        </div>

        {dataError ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load all dashboard data: {dataError.message}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>
                Your five most recent recorded transactions.
              </CardDescription>
            </div>

            <Button asChild size="sm" variant="outline">
              <Link href="/transactions">View all</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {!recentTransactions || recentTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transactions yet.
              </p>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((transaction) => {
                  const account = Array.isArray(transaction.accounts)
                    ? transaction.accounts[0]
                    : transaction.accounts;

                  const category = Array.isArray(transaction.categories)
                    ? transaction.categories[0]
                    : transaction.categories;

                  return (
                    <div
                      className="flex items-center justify-between rounded-lg border p-4"
                      key={transaction.id}
                    >
                      <div>
                        <p className="font-medium">
                          {transaction.description}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {transaction.date} ·{" "}
                          {account?.name ?? "Unknown account"} ·{" "}
                          {category?.name ?? "Uncategorized"}
                        </p>
                      </div>

                      <p
                        className={
                          Number(transaction.amount) < 0
                            ? "font-medium text-red-600"
                            : "font-medium text-emerald-600"
                        }
                      >
                        {new Intl.NumberFormat("es-MX", {
                          style: "currency",
                          currency: transaction.currency,
                        }).format(Number(transaction.amount))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          Net worth is provisional: active MXN account opening balances plus all
          recorded MXN transactions.
        </p>
      </div>
    </main>
  );
}
