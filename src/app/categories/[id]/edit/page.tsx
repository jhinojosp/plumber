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

type EditCategoryPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function EditCategoryPage({
  params,
  searchParams,
}: EditCategoryPageProps) {
  const { id } = await params;
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: category, error } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("id", id)
    .single();

  if (error || !category) {
    notFound();
  }

  async function updateCategory(formData: FormData) {
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

    if (!name || !type) {
      redirect(
        `/categories/${id}/edit?error=Name and type are required`
      );
    }

    const { error } = await supabase
      .from("categories")
      .update({
        name,
        type,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      const message =
        error.code === "23505"
          ? "A category with this name and type already exists"
          : error.message;

      redirect(
        `/categories/${id}/edit?error=${encodeURIComponent(message)}`
      );
    }

    revalidatePath("/categories");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    redirect("/categories");
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
              Edit category
            </h1>
          </div>

          <Button asChild variant="outline">
            <Link href="/categories">Back</Link>
          </Button>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{category.name}</CardTitle>
            <CardDescription>
              Update the category name or type.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form action={updateCategory} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="name">
                  Category name
                </label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={category.name}
                  id="name"
                  name="name"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="type">
                  Category type
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={category.type}
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
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
