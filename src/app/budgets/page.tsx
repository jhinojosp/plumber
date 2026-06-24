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

type BudgetsPageProps = {
  searchParams: Promise<{
    month?: string;
    error?: string;
  }>;
};

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeMonth(value?: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  return getCurrentMonth();
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));

  return date.toISOString().slice(0, 7);
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

export default async function BudgetsPage({
  searchParams,
}: BudgetsPageProps) {
  const params = await searchParams;
  const selectedMonth = normalizeMonth(params.month);
  const monthStart = `${selectedMonth}-01`;
  const nextMonthStart = `${shiftMonth(selectedMonth, 1)}-01`;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: categories, error: categoriesError },
    { data: budgets, error: budgetsError },
    { data: transactions, error: transactionsError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("type", "expense")
      .order("name"),

    supabase
      .from("budgets")
      .select("id, category_id, amount, currency")
      .eq("budget_month", monthStart)
      .eq("currency", "MXN"),

    supabase
      .from("transactions")
      .select("category_id, amount")
      .eq("transaction_type", "expense")
      .eq("currency", "MXN")
      .gte("date", monthStart)
      .lt("date", nextMonthStart),
  ]);

  async function saveBudget(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const categoryId = String(formData.get("category_id") ?? "");
    const budgetMonth = String(formData.get("budget_month") ?? "");
    const amount = Number(formData.get("amount") ?? 0);

    if (!categoryId || !/^\d{4}-\d{2}$/.test(budgetMonth)) {
      redirect(
        `/budgets?month=${selectedMonth}&error=Invalid category or month`
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      redirect(
        `/budgets?month=${budgetMonth}&error=Budget amount must be greater than zero`
      );
    }

    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("user_id", user.id)
      .eq("type", "expense")
      .single();

    if (categoryError || !category) {
      redirect(
        `/budgets?month=${budgetMonth}&error=Expense category not found`
      );
    }

    const { error } = await supabase.from("budgets").upsert(
      {
        user_id: user.id,
        category_id: categoryId,
        budget_month: `${budgetMonth}-01`,
        amount,
        currency: "MXN",
      },
      {
        onConflict: "user_id,category_id,budget_month,currency",
      }
    );

    if (error) {
      redirect(
        `/budgets?month=${budgetMonth}&error=${encodeURIComponent(
          error.message
        )}`
      );
    }

    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    redirect(`/budgets?month=${budgetMonth}`);
  }

  async function deleteBudget(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const budgetId = String(formData.get("budget_id") ?? "");
    const budgetMonth = String(formData.get("budget_month") ?? "");

    if (!budgetId) {
      redirect(
        `/budgets?month=${budgetMonth}&error=Budget ID is required`
      );
    }

    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("id", budgetId)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/budgets?month=${budgetMonth}&error=${encodeURIComponent(
          error.message
        )}`
      );
    }

    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    redirect(`/budgets?month=${budgetMonth}`);
  }

  const dataError = categoriesError || budgetsError || transactionsError;

  const budgetByCategory = new Map(
    (budgets ?? []).map((budget) => [budget.category_id, budget])
  );

  const spendingByCategory = new Map<string, number>();

  for (const transaction of transactions ?? []) {
    if (!transaction.category_id) {
      continue;
    }

    const current = spendingByCategory.get(transaction.category_id) ?? 0;

    spendingByCategory.set(
      transaction.category_id,
      current + Math.abs(Number(transaction.amount))
    );
  }

  const totalBudget = (budgets ?? []).reduce(
    (total, budget) => total + Number(budget.amount),
    0
  );

  const totalSpent = Array.from(spendingByCategory.values()).reduce(
    (total, amount) => total + amount,
    0
  );

  const totalRemaining = totalBudget - totalSpent;
  const totalUsage =
    totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Budgets
            </h1>
            <p className="mt-2 text-muted-foreground">
              Set monthly spending limits by expense category.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/categories">Categories</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/transactions">Transactions</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>

        {params.error ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </div>
        ) : null}

        {dataError ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load budget data: {dataError.message}
          </div>
        ) : null}

        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <Button asChild variant="outline">
              <Link href={`/budgets?month=${shiftMonth(selectedMonth, -1)}`}>
                Previous month
              </Link>
            </Button>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">Budget period</p>
              <p className="text-xl font-semibold">
                {formatMonth(selectedMonth)}
              </p>
            </div>

            <Button asChild variant="outline">
              <Link href={`/budgets?month=${shiftMonth(selectedMonth, 1)}`}>
                Next month
              </Link>
            </Button>
          </CardContent>
        </Card>

        <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total budget</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {formatCurrency(totalBudget)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Actual spending</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {formatCurrency(totalSpent)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Remaining</CardDescription>
            </CardHeader>
            <CardContent>
              <p
                className={
                  totalRemaining < 0
                    ? "text-2xl font-semibold text-red-600"
                    : "text-2xl font-semibold"
                }
              >
                {formatCurrency(totalRemaining)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Budget used</CardDescription>
            </CardHeader>
            <CardContent>
              <p
                className={
                  totalUsage > 100
                    ? "text-2xl font-semibold text-red-600"
                    : "text-2xl font-semibold"
                }
              >
                {totalUsage}%
              </p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Expense categories</CardTitle>
            <CardDescription>
              Enter an amount to create or update each monthly budget.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {!categories || categories.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Create at least one expense category before setting budgets.
                </p>

                <Button asChild className="mt-4" variant="outline">
                  <Link href="/categories">Create category</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map((category) => {
                  const budget = budgetByCategory.get(category.id);
                  const budgetAmount = Number(budget?.amount ?? 0);
                  const spent = spendingByCategory.get(category.id) ?? 0;
                  const remaining = budgetAmount - spent;
                  const usage =
                    budgetAmount > 0
                      ? Math.round((spent / budgetAmount) * 100)
                      : 0;

                  return (
                    <div
                      className="rounded-lg border p-4"
                      key={category.id}
                    >
                      <div className="grid gap-4 lg:grid-cols-[1fr_140px_140px_140px_auto] lg:items-end">
                        <div>
                          <p className="font-medium">{category.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {budget
                              ? `${usage}% used`
                              : "No budget configured"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            Budget
                          </p>
                          <p className="font-medium">
                            {formatCurrency(budgetAmount)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            Spent
                          </p>
                          <p className="font-medium">
                            {formatCurrency(spent)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            Remaining
                          </p>
                          <p
                            className={
                              remaining < 0
                                ? "font-medium text-red-600"
                                : "font-medium"
                            }
                          >
                            {formatCurrency(remaining)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <form
                            action={saveBudget}
                            className="flex items-end gap-2"
                          >
                            <input
                              name="category_id"
                              type="hidden"
                              value={category.id}
                            />
                            <input
                              name="budget_month"
                              type="hidden"
                              value={selectedMonth}
                            />

                            <div className="space-y-1">
                              <label
                                className="text-xs text-muted-foreground"
                                htmlFor={`amount-${category.id}`}
                              >
                                Monthly limit
                              </label>
                              <input
                                className="w-32 rounded-md border bg-background px-3 py-2 text-sm"
                                defaultValue={
                                  budget ? Number(budget.amount) : ""
                                }
                                id={`amount-${category.id}`}
                                min="0.01"
                                name="amount"
                                placeholder="0.00"
                                required
                                step="0.01"
                                type="number"
                              />
                            </div>

                            <Button size="sm" type="submit">
                              {budget ? "Update" : "Save"}
                            </Button>
                          </form>

                          {budget ? (
                            <form action={deleteBudget}>
                              <input
                                name="budget_id"
                                type="hidden"
                                value={budget.id}
                              />
                              <input
                                name="budget_month"
                                type="hidden"
                                value={selectedMonth}
                              />

                              <Button
                                className="mt-5"
                                size="sm"
                                type="submit"
                                variant="destructive"
                              >
                                Delete
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </div>

                      {budgetAmount > 0 ? (
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={
                              usage > 100
                                ? "h-full rounded-full bg-red-600"
                                : "h-full rounded-full bg-foreground"
                            }
                            style={{
                              width: `${Math.min(usage, 100)}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
