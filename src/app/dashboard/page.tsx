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
    { data: balanceSnapshots, error: balancesError },
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
      .select("account_id, amount, currency")
      .eq("currency", "MXN"),

    supabase
      .from("accounts")
      .select("id, name, type, initial_balance, currency, is_active")
      .eq("currency", "MXN")
      .eq("is_active", true),

    supabase
      .from("account_balances")
      .select("account_id, date, balance, currency, created_at")
      .eq("currency", "MXN")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),

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
    monthlyError ||
    allTransactionsError ||
    accountsError ||
    balancesError ||
    recentError;

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

  const latestSnapshotByAccount = new Map<string, number>();

  for (const snapshot of balanceSnapshots ?? []) {
    if (!latestSnapshotByAccount.has(snapshot.account_id)) {
      latestSnapshotByAccount.set(
        snapshot.account_id,
        Number(snapshot.balance)
      );
    }
  }

  const transactionsByAccount = new Map<string, number>();

  for (const transaction of allTransactions ?? []) {
    const current = transactionsByAccount.get(transaction.account_id) ?? 0;

    transactionsByAccount.set(
      transaction.account_id,
      current + Number(transaction.amount)
    );
  }

  const netWorth =
    accounts?.reduce((total, account) => {
      const latestSnapshot = latestSnapshotByAccount.get(account.id);

      if (latestSnapshot !== undefined) {
        const isLiability =
          account.type === "credit_card" || account.type === "loan";

        return (
          total +
          (isLiability ? -Math.abs(latestSnapshot) : latestSnapshot)
        );
      }

      const fallbackBalance =
        Number(account.initial_balance) +
        (transactionsByAccount.get(account.id) ?? 0);

      return total + fallbackBalance;
    }, 0) ?? 0;

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
      value: formatCurrency(netWorth),
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
              <Link href="/balances">Balances</Link>
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
          Net worth uses the latest balance snapshot for each account. Accounts
          without snapshots use opening balance plus recorded transactions.
        </p>
      </div>
    </main>
  );
}
