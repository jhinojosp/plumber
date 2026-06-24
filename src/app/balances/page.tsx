import Link from "next/link";
import { revalidatePath } from "next/cache";
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

type BalancesPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

type Account = {
  id: string;
  name: string;
  type: string;
  currency: string;
};

type BalanceSnapshot = {
  id: string;
  account_id: string;
  date: string;
  balance: number | string;
  currency: string;
  source: string;
  accounts:
    | {
        name: string;
        type: string;
      }
    | {
        name: string;
        type: string;
      }[]
    | null;
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(value);
}

export default async function BalancesPage({
  searchParams,
}: BalancesPageProps) {
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: accounts, error: accountsError },
    { data: snapshots, error: snapshotsError },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, currency")
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("account_balances")
      .select(
        `
        id,
        account_id,
        date,
        balance,
        currency,
        source,
        accounts(name, type)
      `
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  async function saveBalance(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const accountId = String(formData.get("account_id") ?? "");
    const date = String(formData.get("date") ?? "");
    const currency = String(formData.get("currency") ?? "MXN");
    const balance = Number(formData.get("balance") ?? 0);

    if (!accountId || !date) {
      redirect("/balances?error=Account and date are required");
    }

    if (!Number.isFinite(balance)) {
      redirect("/balances?error=Balance must be a valid number");
    }

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .single();

    if (accountError || !account) {
      redirect("/balances?error=Account not found");
    }

    const { error } = await supabase.from("account_balances").upsert(
      {
        user_id: user.id,
        account_id: accountId,
        date,
        balance,
        currency,
        source: "manual",
      },
      {
        onConflict: "account_id,date",
      }
    );

    if (error) {
      redirect(`/balances?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/balances");
    revalidatePath("/dashboard");
    redirect("/balances");
  }

  async function deleteBalance(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const balanceId = String(formData.get("balance_id") ?? "");

    const { error } = await supabase
      .from("account_balances")
      .delete()
      .eq("id", balanceId)
      .eq("user_id", user.id);

    if (error) {
      redirect(`/balances?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/balances");
    revalidatePath("/dashboard");
    redirect("/balances");
  }

  const activeAccounts = (accounts ?? []) as Account[];
  const balanceSnapshots = (snapshots ?? []) as BalanceSnapshot[];

  const latestByAccount = new Map<string, BalanceSnapshot>();

  for (const snapshot of balanceSnapshots) {
    if (!latestByAccount.has(snapshot.account_id)) {
      latestByAccount.set(snapshot.account_id, snapshot);
    }
  }

  const latestMxnNetWorth = Array.from(latestByAccount.values())
    .filter((snapshot) => snapshot.currency === "MXN")
    .reduce((total, snapshot) => {
      const account = Array.isArray(snapshot.accounts)
        ? snapshot.accounts[0]
        : snapshot.accounts;

      const accountType = account?.type;
      const value = Number(snapshot.balance);
      const isLiability =
        accountType === "credit_card" || accountType === "loan";

      return total + (isLiability ? -Math.abs(value) : value);
    }, 0);

  const dataError = accountsError || snapshotsError;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Account balances
            </h1>
            <p className="mt-2 text-muted-foreground">
              Record dated balance snapshots for net worth tracking.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/accounts">Accounts</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {dataError ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {dataError.message}
          </div>
        ) : null}

        <Card className="mb-6">
          <CardHeader>
            <CardDescription>Latest recorded MXN balances</CardDescription>
            <CardTitle className="text-3xl">
              {formatCurrency(latestMxnNetWorth, "MXN")}
            </CardTitle>
          </CardHeader>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add balance snapshot</CardTitle>
              <CardDescription>
                Saving the same account and date updates the existing snapshot.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form action={saveBalance} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="account_id">
                    Account
                  </label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="account_id"
                    name="account_id"
                    required
                  >
                    <option value="">Select account</option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.currency})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="date">
                    Date
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="date"
                    name="date"
                    required
                    type="date"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="balance">
                    Balance
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="balance"
                    name="balance"
                    required
                    step="0.01"
                    type="number"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="currency">
                    Currency
                  </label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue="MXN"
                    id="currency"
                    name="currency"
                    required
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <Button
                  className="w-full"
                  disabled={activeAccounts.length === 0}
                  type="submit"
                >
                  Save balance
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent snapshots</CardTitle>
              <CardDescription>
                The 50 most recently recorded account balances.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {balanceSnapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No balance snapshots yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {balanceSnapshots.map((snapshot) => (
                    <div
                      className="flex items-center justify-between rounded-lg border p-4"
                      key={snapshot.id}
                    >
                      <div>
                        <p className="font-medium">
                          {(Array.isArray(snapshot.accounts)
                            ? snapshot.accounts[0]?.name
                            : snapshot.accounts?.name) ?? "Unknown account"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {snapshot.date} · {snapshot.source}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <p className="font-medium">
                          {formatCurrency(
                            Number(snapshot.balance),
                            snapshot.currency
                          )}
                        </p>

                        <form action={deleteBalance}>
                          <input
                            name="balance_id"
                            type="hidden"
                            value={snapshot.id}
                          />
                          <Button
                            size="sm"
                            type="submit"
                            variant="destructive"
                          >
                            Delete
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
