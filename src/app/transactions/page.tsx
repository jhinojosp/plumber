import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { TransactionForm } from "@/components/transactions/transaction-form";
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

  const [
    { data: accounts },
    { data: categories },
    { data: transactions },
  ] = await Promise.all([
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
        transfer_group_id,
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
    const destinationAccountId = String(
      formData.get("destination_account_id") ?? ""
    );
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

    if (transactionType === "transfer") {
      if (!destinationAccountId) {
        redirect("/transactions?error=Destination account is required");
      }

      if (accountId === destinationAccountId) {
        redirect(
          "/transactions?error=Source and destination accounts must be different"
        );
      }

      const { error } = await supabase.rpc("create_account_transfer", {
        p_source_account_id: accountId,
        p_destination_account_id: destinationAccountId,
        p_date: date,
        p_description: description,
        p_amount: rawAmount,
        p_currency: currency,
        p_notes: null,
      });

      if (error) {
        redirect(`/transactions?error=${encodeURIComponent(error.message)}`);
      }
    } else {
      const normalizedAmount =
        transactionType === "expense"
          ? -Math.abs(rawAmount)
          : Math.abs(rawAmount);

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
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    redirect("/transactions");
  }

  async function deleteTransaction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const transactionId = String(formData.get("transaction_id") ?? "");

    if (!transactionId) {
      redirect("/transactions?error=Transaction ID is required");
    }

    const { data: transaction, error: lookupError } = await supabase
      .from("transactions")
      .select("transfer_group_id")
      .eq("id", transactionId)
      .eq("user_id", user.id)
      .single();

    if (lookupError) {
      redirect(
        `/transactions?error=${encodeURIComponent(lookupError.message)}`
      );
    }

    const deleteQuery = transaction.transfer_group_id
      ? supabase
          .from("transactions")
          .delete()
          .eq("transfer_group_id", transaction.transfer_group_id)
          .eq("user_id", user.id)
      : supabase
          .from("transactions")
          .delete()
          .eq("id", transactionId)
          .eq("user_id", user.id);

    const { error } = await deleteQuery;

    if (error) {
      redirect(`/transactions?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    redirect("/transactions");
  }

  const activeAccounts = accounts ?? [];
  const userCategories = categories ?? [];

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
              Record income, expenses, and transfers.
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

        {activeAccounts.length === 0 ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create at least one active account before adding transactions.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add transaction</CardTitle>
              <CardDescription>
                Transfers create one debit and one matching credit.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <TransactionForm
                accounts={activeAccounts}
                action={createTransaction}
                categories={userCategories}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>
                Your 20 most recent transaction entries.
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

                    const isTransfer =
                      transaction.transaction_type === "transfer";

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
                            {isTransfer
                              ? "Transfer"
                              : category?.name ?? "Uncategorized"}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
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

                          {!isTransfer ? (
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/transactions/${transaction.id}/edit`}
                              >
                                Edit
                              </Link>
                            </Button>
                          ) : null}

                          <form action={deleteTransaction}>
                            <input
                              name="transaction_id"
                              type="hidden"
                              value={transaction.id}
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
