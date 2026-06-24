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

type AccountsPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AccountsPage({
  searchParams,
}: AccountsPageProps) {
  const params = await searchParams;
  const errorMessage = params.error;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, type, institution, currency, initial_balance, is_active")
    .order("created_at", { ascending: false });

  async function createAccount(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const name = String(formData.get("name") ?? "").trim();
    const type = String(formData.get("type") ?? "");
    const institution = String(formData.get("institution") ?? "").trim();
    const currency = String(formData.get("currency") ?? "MXN");
    const initialBalance = Number(formData.get("initial_balance") ?? 0);

    if (!name) {
      redirect("/accounts?error=Account name is required");
    }

    if (!Number.isFinite(initialBalance)) {
      redirect("/accounts?error=Initial balance must be a valid number");
    }

    const { error } = await supabase.from("accounts").insert({
      user_id: user.id,
      name,
      type,
      institution: institution || null,
      currency,
      initial_balance: initialBalance,
    });

    if (error) {
      redirect(`/accounts?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/accounts");
    redirect("/accounts");
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Accounts
            </h1>
            <p className="mt-2 text-muted-foreground">
              Add and manage your financial accounts.
            </p>
          </div>

          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {accountsError ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {accountsError.message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add account</CardTitle>
              <CardDescription>
                Create a bank, cash, credit, investment, or loan account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form action={createAccount} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="name">
                    Account name
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="name"
                    name="name"
                    placeholder="e.g. BBVA Checking"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="institution">
                    Institution
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="institution"
                    name="institution"
                    placeholder="e.g. BBVA"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="type">
                    Account type
                  </label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="type"
                    name="type"
                    required
                  >
                    <option value="checking">Checking</option>
                    <option value="cash">Cash</option>
                    <option value="credit_card">Credit card</option>
                    <option value="brokerage">Brokerage</option>
                    <option value="retirement">Retirement</option>
                    <option value="loan">Loan</option>
                    <option value="other">Other</option>
                  </select>
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

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="initial_balance"
                  >
                    Initial balance
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue="0"
                    id="initial_balance"
                    name="initial_balance"
                    step="0.01"
                    type="number"
                  />
                </div>

                <Button className="w-full" type="submit">
                  Add account
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your accounts</CardTitle>
              <CardDescription>
                Accounts visible only to your authenticated user.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!accounts || accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No accounts yet. Add your first account using the form.
                </p>
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div
                      className="flex items-center justify-between rounded-lg border p-4"
                      key={account.id}
                    >
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {account.institution || "No institution"} ·{" "}
                          {account.type.replaceAll("_", " ")}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-medium">
                            {new Intl.NumberFormat("es-MX", {
                              style: "currency",
                              currency: account.currency,
                            }).format(Number(account.initial_balance))}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {account.is_active ? "Active" : "Archived"}
                          </p>
                        </div>

                        <Button asChild size="sm" variant="outline">
                          <Link href={`/accounts/${account.id}/edit`}>
                            Edit
                          </Link>
                        </Button>
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
