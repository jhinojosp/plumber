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

type TransactionsPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: accounts }, { data: categories }, { data: transactions }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, currency, is_active")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("categories")
        .select("id, name, type")
        .order("type")
        .order("name"),
      supabase
        .from("transactions")
        .select(
          `
          id,
          date,
          description,
          merchant,
          amount,
          currency,
          transaction_type,
          accounts(name),
          categories(name)
        `
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  async function createTransaction(formData: FormData) {
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
      redirect("/transactions?error=Please complete all required fields");
    }

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      redirect("/transactions?error=Amount must be greater than zero");
    }

    const normalizedAmount =
      transactionType === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      account_id: accountId,
      category_id: categoryId || null,
      date,
      description,
      merchant: merchant || null,
      amount: normalizedAmount,
      currency,
      transaction_type: transactionType,
      source: "manual",
    });

    if (error) {
      redirect(`/transactions?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    redirect("/transactions");
  }

  const hasAccounts = accounts && accounts.length > 0;
  const hasCategories = categories && categories.length > 0;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Transactions
            </h1>
            <p className="mt-2 text-muted-foreground">
              Record and review income and expenses.
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/categories">Categories</Link>
            </Button>
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

        {!hasAccounts ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create at least one active account before adding transactions.
          </div>
        ) : null}

        {!hasCategories ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create at least one category before adding transactions.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add transaction</CardTitle>
              <CardDescription>
                Expenses are stored as negative amounts. Income is stored as
                positive amounts.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form action={createTransaction} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="account_id">
                    Account
                  </label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    disabled={!hasAccounts}
                    id="account_id"
                    name="account_id"
                    required
                  >
                    <option value="">Select account</option>
                    {accounts?.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
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
                    disabled={!hasCategories}
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
                    id="description"
                    name="description"
                    placeholder="e.g. Dinner"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="merchant">
                    Merchant
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="merchant"
                    name="merchant"
                    placeholder="e.g. Restaurant"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="amount">
                    Amount
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
                  disabled={!hasAccounts}
                  type="submit"
                >
                  Add transaction
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>
                Your 20 most recent transactions.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!transactions || transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No transactions yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction) => {
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
        </div>
      </div>
    </main>
  );
}
