import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type EditAccountPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function EditAccountPage({
  params,
  searchParams,
}: EditAccountPageProps) {
  const { id } = await params;
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account, error } = await supabase
    .from("accounts")
    .select(
      "id, name, type, institution, currency, initial_balance, is_active"
    )
    .eq("id", id)
    .single();

  if (error || !account) {
    notFound();
  }

  async function updateAccount(formData: FormData) {
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
      redirect(`/accounts/${id}/edit?error=Account name is required`);
    }

    if (!Number.isFinite(initialBalance)) {
      redirect(
        `/accounts/${id}/edit?error=Initial balance must be a valid number`
      );
    }

    const { error } = await supabase
      .from("accounts")
      .update({
        name,
        type,
        institution: institution || null,
        currency,
        initial_balance: initialBalance,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/accounts/${id}/edit?error=${encodeURIComponent(error.message)}`
      );
    }

    revalidatePath("/accounts");
    redirect("/accounts");
  }

  async function toggleAccountStatus() {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { error } = await supabase
      .from("accounts")
      .update({
        is_active: !account.is_active,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/accounts/${id}/edit?error=${encodeURIComponent(error.message)}`
      );
    }

    revalidatePath("/accounts");
    redirect("/accounts");
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Edit account
            </h1>
          </div>

          <Button asChild variant="outline">
            <Link href="/accounts">Back</Link>
          </Button>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{account.name}</CardTitle>
            <CardDescription>
              Update the account or change its active status.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form action={updateAccount} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="name">
                  Account name
                </label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={account.name}
                  id="name"
                  name="name"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="institution">
                  Institution
                </label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={account.institution ?? ""}
                  id="institution"
                  name="institution"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="type">
                  Account type
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={account.type}
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
                  defaultValue={account.currency}
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
                  defaultValue={Number(account.initial_balance)}
                  id="initial_balance"
                  name="initial_balance"
                  step="0.01"
                  type="number"
                />
              </div>

              <Button className="w-full" type="submit">
                Save changes
              </Button>
            </form>

            <div className="border-t pt-6">
              <form action={toggleAccountStatus}>
                <Button
                  className="w-full"
                  type="submit"
                  variant={account.is_active ? "destructive" : "outline"}
                >
                  {account.is_active ? "Archive account" : "Reactivate account"}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
