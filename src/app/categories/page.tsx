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

type CategoriesPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name, type, parent_id, created_at")
    .order("type")
    .order("name");

  async function createCategory(formData: FormData) {
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

    if (!name) {
      redirect("/categories?error=Category name is required");
    }

    const { error } = await supabase.from("categories").insert({
      user_id: user.id,
      name,
      type,
    });

    if (error) {
      redirect(`/categories?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/categories");
    redirect("/categories");
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
              Categories
            </h1>
            <p className="mt-2 text-muted-foreground">
              Organize income, expenses, and transfers.
            </p>
          </div>

          <div className="flex gap-2">
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

        {categoriesError ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {categoriesError.message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add category</CardTitle>
              <CardDescription>
                Create a category for income, expenses, or transfers.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form action={createCategory} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="name">
                    Category name
                  </label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="name"
                    name="name"
                    placeholder="e.g. Restaurants"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="type">
                    Category type
                  </label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id="type"
                    name="type"
                    required
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>

                <Button className="w-full" type="submit">
                  Add category
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your categories</CardTitle>
              <CardDescription>
                Categories visible only to your authenticated user.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!categories || categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No categories yet. Add your first category.
                </p>
              ) : (
                <div className="space-y-3">
                  {categories.map((category) => (
                    <div
                      className="flex items-center justify-between rounded-lg border p-4"
                      key={category.id}
                    >
                      <div>
                        <p className="font-medium">{category.name}</p>
                        <p className="text-sm capitalize text-muted-foreground">
                          {category.type}
                        </p>
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
