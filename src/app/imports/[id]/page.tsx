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

type ImportReviewPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(value);
}

export default async function ImportReviewPage({
  params,
  searchParams,
}: ImportReviewPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: batch, error: batchError },
    { data: rows, error: rowsError },
  ] = await Promise.all([
    supabase
      .from("import_batches")
      .select(
        "id, account_id, file_name, status, total_rows, ready_rows, duplicate_rows, error_rows, imported_rows, created_at"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),

    supabase
      .from("transaction_import_rows")
      .select(
        "id, row_number, transaction_date, description, merchant, amount, currency, status, error_message"
      )
      .eq("batch_id", id)
      .eq("user_id", user.id)
      .order("row_number"),
  ]);

  if (batchError || !batch) {
    notFound();
  }

  async function toggleRow(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const rowId = String(formData.get("row_id") ?? "");
    const currentStatus = String(formData.get("current_status") ?? "");

    if (!rowId) {
      redirect(`/imports/${id}?error=Import row ID is required`);
    }

    const nextStatus =
      currentStatus === "excluded" ? "ready" : "excluded";

    const { error } = await supabase
      .from("transaction_import_rows")
      .update({
        status: nextStatus,
      })
      .eq("id", rowId)
      .eq("batch_id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/imports/${id}?error=${encodeURIComponent(error.message)}`
      );
    }

    const { data: updatedRows, error: countError } = await supabase
      .from("transaction_import_rows")
      .select("status")
      .eq("batch_id", id)
      .eq("user_id", user.id);

    if (countError) {
      redirect(
        `/imports/${id}?error=${encodeURIComponent(countError.message)}`
      );
    }

    const readyRows =
      updatedRows?.filter((row) => row.status === "ready").length ?? 0;

    const duplicateRows =
      updatedRows?.filter((row) => row.status === "duplicate").length ?? 0;

    const errorRows =
      updatedRows?.filter((row) => row.status === "error").length ?? 0;

    await supabase
      .from("import_batches")
      .update({
        ready_rows: readyRows,
        duplicate_rows: duplicateRows,
        error_rows: errorRows,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    revalidatePath(`/imports/${id}`);
    revalidatePath("/imports");
    redirect(`/imports/${id}`);
  }

  async function importReadyRows() {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { data: importBatch, error: importBatchError } = await supabase
      .from("import_batches")
      .select("id, account_id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (importBatchError || !importBatch) {
      redirect(`/imports/${id}?error=Import batch not found`);
    }

    if (importBatch.status === "imported") {
      redirect(`/imports/${id}?error=This batch has already been imported`);
    }

    const { data: readyRows, error: readyRowsError } = await supabase
      .from("transaction_import_rows")
      .select(
        "id, transaction_date, description, merchant, amount, currency"
      )
      .eq("batch_id", id)
      .eq("user_id", user.id)
      .eq("status", "ready")
      .order("row_number");

    if (readyRowsError) {
      redirect(
        `/imports/${id}?error=${encodeURIComponent(
          readyRowsError.message
        )}`
      );
    }

    if (!readyRows || readyRows.length === 0) {
      redirect(`/imports/${id}?error=There are no ready rows to import`);
    }

    const transactionsToInsert = readyRows.map((row) => ({
      user_id: user.id,
      account_id: importBatch.account_id,
      category_id: null,
      date: row.transaction_date,
      description: row.description || row.merchant || "Imported transaction",
      merchant: row.merchant || null,
      amount: Number(row.amount),
      currency: row.currency || "MXN",
      transaction_type:
        Number(row.amount) < 0 ? "expense" : "income",
      source: "csv_import",
    }));

    const { data: insertedTransactions, error: insertError } = await supabase
      .from("transactions")
      .insert(transactionsToInsert)
      .select("id");

    if (insertError || !insertedTransactions) {
      redirect(
        `/imports/${id}?error=${encodeURIComponent(
          insertError?.message ?? "Could not import transactions"
        )}`
      );
    }

    for (let index = 0; index < readyRows.length; index += 1) {
      const row = readyRows[index];
      const transaction = insertedTransactions[index];

      await supabase
        .from("transaction_import_rows")
        .update({
          status: "imported",
          imported_transaction_id: transaction.id,
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
    }

    const { error: batchUpdateError } = await supabase
      .from("import_batches")
      .update({
        status: "imported",
        ready_rows: 0,
        imported_rows: insertedTransactions.length,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (batchUpdateError) {
      redirect(
        `/imports/${id}?error=${encodeURIComponent(
          batchUpdateError.message
        )}`
      );
    }

    revalidatePath(`/imports/${id}`);
    revalidatePath("/imports");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");

    redirect(
      `/imports/${id}?success=${encodeURIComponent(
        `${insertedTransactions.length} transactions imported`
      )}`
    );
  }

  const dataError = rowsError;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Review import
            </h1>
            <p className="mt-2 text-muted-foreground">
              {batch.file_name}
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/imports">Back to imports</Link>
            </Button>

            <Button asChild variant="outline">
              <Link href="/transactions">Transactions</Link>
            </Button>
          </div>
        </div>

        {query.error ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        {query.success ? (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {query.success}
          </div>
        ) : null}

        {dataError ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {dataError.message}
          </div>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{batch.total_rows}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ready</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{batch.ready_rows}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Duplicates</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {batch.duplicate_rows}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Errors</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{batch.error_rows}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Imported</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {batch.imported_rows}
              </p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Staged rows</CardTitle>
              <CardDescription>
                Only rows marked Ready will be imported.
              </CardDescription>
            </div>

            {batch.status !== "imported" ? (
              <form action={importReadyRows}>
                <Button type="submit">
                  Import ready rows
                </Button>
              </form>
            ) : null}
          </CardHeader>

          <CardContent>
            {!rows || rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No staged rows found.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">Merchant</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="px-3 py-2">{row.row_number}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.transaction_date ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.description ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.merchant ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {row.amount === null
                            ? "—"
                            : formatCurrency(
                                Number(row.amount),
                                row.currency || "MXN"
                              )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium capitalize">
                            {row.status}
                          </span>

                          {row.error_message ? (
                            <p className="mt-1 max-w-64 text-xs text-red-600">
                              {row.error_message}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {row.status === "ready" ||
                          row.status === "excluded" ? (
                            <form action={toggleRow}>
                              <input
                                name="row_id"
                                type="hidden"
                                value={row.id}
                              />
                              <input
                                name="current_status"
                                type="hidden"
                                value={row.status}
                              />

                              <Button size="sm" type="submit" variant="outline">
                                {row.status === "excluded"
                                  ? "Include"
                                  : "Exclude"}
                              </Button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
