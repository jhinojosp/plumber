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

type EditTransactionPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function EditTransactionPage({
  params,
  searchParams,
}: EditTransactionPageProps) {
  const { id } = await params;
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: transaction, error: transactionError },
    { data: accounts },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, account_id, category_id, date, description, merchant, amount, currency, transaction_type"
      )
      .eq("id", id)
      .single(),

    supabase
      .from("accounts")
      .select("id, name, is_active")
      .order("name"),

    supabase
      .from("categories")
      .select("id, name, type")
      .order("type")
      .order("name"),
  ]);

  if (transactionError || !transaction) {
    notFound();
  }

  async function updateTransaction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const accountId = String(formData.get("account_id") ?? "");
    const categoryId = String(formData.get("category_id") ?? "");
    const date = String(formData.get("date") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const merchant = String(formData.get("merchant") ?? "").trim();
    const transactionType = String(formData.get("transaction_type") ?? "");
    const currency = String(formData.get("currency") ?? "MXN");
    const rawAmount = Number(formData.get("amount") ?? 0);

    if (!accountId || !date || !description || !transactionType) {
      redirect(
        `/transactions/${id}/edit?error=Please complete all required fields`
      );
    }

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      redirect(
        `/transactions/${id}/edit?error=Amount must be greater than zero`
      );
    }

    const normalizedAmount =
      transactionType === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

    const { error } = await supabase
      .from("transactions")
      .update({
        account_id: accountId,
        category_id: categoryId || null,
        date,
        description,
        merchant: merchant || null,
        amount: normalizedAmount,
        currency,
        transaction_type: transactionType,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/transactions/${id}/edit?error=${encodeURIComponent(error.message)}`
      );
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    redirect("/transactions");
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
              Edit transaction
            </h1>
          </div>

          <Button asChild variant="outline">
            <Link href="/transactions">Back</Link>
          </Button>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{transaction.description}</CardTitle>
            <CardDescription>
              Update the transaction details.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form action={updateTransaction} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="account_id">
                  Account
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={transaction.account_id}
                  id="account_id"
                  name="account_id"
                  required
                >
                  {accounts?.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.is_active ? "" : " (archived)"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="transaction_type"
                >
                  Type
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={transaction.transaction_type}
                  id="transaction_type"
                  name="transaction_type"
                  required
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="category_id">
                  Category
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={transaction.category_id ?? ""}
                  id="category_id"
                  name="category_id"
                >
                  <option value="">No category</option>
                  {categories?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.type})
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
                  defaultValue={transaction.date}
                  id="date"
                  name="date"
                  required
                  type="date"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="description">
                  Description
                </label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={transaction.description}
                  id="description"
                  name="description"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="merchant">
                  Merchant
                </label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={transaction.merchant ?? ""}
                  id="merchant"
                  name="merchant"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="amount">
                  Amount
                </label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={Math.abs(Number(transaction.amount))}
                  id="amount"
                  min="0.01"
                  name="amount"
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
                  defaultValue={transaction.currency}
                  id="currency"
                  name="currency"
                  required
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>

              <Button className="w-full" type="submit">
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
