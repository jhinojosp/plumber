import { createHash } from "crypto";

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CsvImportForm } from "@/components/imports/csv-import-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type ImportsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type CsvRow = Record<string, unknown>;

type ColumnMapping = {
  date: string;
  description: string;
  merchant: string;
  amount: string;
  debit: string;
  credit: string;
  currency: string;
};

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function parseNumericValue(value: unknown) {
  const raw = stringValue(value);

  if (!raw) {
    return null;
  }

  const isNegative =
    raw.includes("(") ||
    raw.trim().startsWith("-");

  const normalized = raw
    .replace(/[$€£,\s]/g, "")
    .replace(/[()]/g, "");

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isNegative ? -Math.abs(parsed) : parsed;
}

function parseAmount(
  row: CsvRow,
  mapping: ColumnMapping
) {
  const directAmount = mapping.amount
    ? stringValue(row[mapping.amount])
    : "";


  if (directAmount) {
    return parseNumericValue(directAmount);
  }

  const debit = mapping.debit
    ? parseNumericValue(row[mapping.debit])
    : null;

  const credit = mapping.credit
    ? parseNumericValue(row[mapping.credit])
    : null;

  if (debit !== null && debit !== 0) {
    return -Math.abs(debit);
  }

  if (credit !== null && credit !== 0) {
    return Math.abs(credit);
  }

  return null;
}

function parseDate(value: unknown) {
  const raw = stringValue(value);

  if (!raw) {
    return null;
  }

  // Excel serial dates, including values formatted with commas,
  // such as "46,174.0" = 2026-06-01.
  const normalizedNumericDate = raw.replace(/,/g, "").trim();

  if (/^\d+(?:\.\d+)?$/.test(normalizedNumericDate)) {
    const serial = Number(normalizedNumericDate);

    if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const milliseconds = excelEpoch + Math.floor(serial) * 86_400_000;
      const parsedDate = new Date(milliseconds);

      return parsedDate.toISOString().slice(0, 10);
    }
  }

  const isoMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/
  );

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const slashMatch = raw.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/
  );

  if (slashMatch) {
    const [, firstRaw, secondRaw, yearRaw] = slashMatch;

    const first = Number(firstRaw);
    const second = Number(secondRaw);
    const year =
      yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

    let day: number;
    let month: number;

    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }

    const candidate = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

    const parsedDate = new Date(`${candidate}T00:00:00Z`);

    if (
      parsedDate.getUTCFullYear() === Number(year) &&
      parsedDate.getUTCMonth() + 1 === month &&
      parsedDate.getUTCDate() === day
    ) {
      return candidate;
    }

    return null;
  }

  const parsedDate = new Date(raw);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeMatchValue(value: unknown) {
  return stringValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type CategoryRule = {
  category_id: string;
  match_field: "merchant" | "description";
  match_type: "exact" | "contains";
  match_value: string;
  priority: number;
};

type CategorizedTransaction = {
  category_id: string | null;
  description: string | null;
  merchant: string | null;
};

function findCategorySuggestion(values: {
  description: string;
  merchant: string;
  rules: CategoryRule[];
  history: CategorizedTransaction[];
}) {
  const normalizedDescription = normalizeMatchValue(values.description);
  const normalizedMerchant = normalizeMatchValue(values.merchant);

  for (const rule of values.rules) {
    const candidate =
      rule.match_field === "merchant"
        ? normalizedMerchant
        : normalizedDescription;

    const ruleValue = normalizeMatchValue(rule.match_value);

    if (!candidate || !ruleValue) {
      continue;
    }

    const matches =
      rule.match_type === "exact"
        ? candidate === ruleValue
        : candidate.includes(ruleValue);

    if (matches) {
      return {
        categoryId: rule.category_id,
        categorySource: "rule" as const,
      };
    }
  }

  for (const transaction of values.history) {
    if (!transaction.category_id) {
      continue;
    }

    const historicalMerchant = normalizeMatchValue(transaction.merchant);
    const historicalDescription = normalizeMatchValue(
      transaction.description
    );

    if (
      normalizedMerchant &&
      historicalMerchant &&
      normalizedMerchant === historicalMerchant
    ) {
      return {
        categoryId: transaction.category_id,
        categorySource: "history" as const,
      };
    }

    if (
      normalizedDescription &&
      historicalDescription &&
      normalizedDescription === historicalDescription
    ) {
      return {
        categoryId: transaction.category_id,
        categorySource: "history" as const,
      };
    }
  }

  return {
    categoryId: null,
    categorySource: null,
  };
}

function createFingerprint(values: {
  accountId: string;
  date: string;
  amount: number;
  description: string;
  merchant: string;
  currency: string;
}) {
  const normalized = [
    values.accountId,
    values.date,
    values.amount.toFixed(2),
    values.description.toLowerCase().replace(/\s+/g, " ").trim(),
    values.merchant.toLowerCase().replace(/\s+/g, " ").trim(),
    values.currency.toUpperCase(),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex");
}

export default async function ImportsPage({
  searchParams,
}: ImportsPageProps) {
  const params = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: accounts, error: accountsError },
    { data: recentBatches, error: batchesError },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, currency")
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("import_batches")
      .select(
        "id, file_name, status, total_rows, ready_rows, duplicate_rows, error_rows, imported_rows, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  async function createImportBatch(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const accountId = String(formData.get("account_id") ?? "");
    const fileName = String(formData.get("file_name") ?? "").trim();
    const rowsJson = String(formData.get("rows_json") ?? "");
    const mappingJson = String(
      formData.get("mapping_json") ?? ""
    );

    if (!accountId || !fileName || !rowsJson || !mappingJson) {
      redirect(
        "/imports?error=Account, file, rows, and column mapping are required"
      );
    }

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (accountError || !account) {
      redirect("/imports?error=Account not found");
    }

    let parsedRows: CsvRow[];
    let mapping: ColumnMapping;

    try {
      const parsed = JSON.parse(rowsJson);
      const parsedMapping = JSON.parse(mappingJson);

      if (!Array.isArray(parsed)) {
        throw new Error("Rows payload must be an array");
      }

      parsedRows = parsed.slice(0, 2000);
      mapping = parsedMapping as ColumnMapping;
    } catch {
      redirect(
        "/imports?error=Could not read the parsed CSV rows or mapping"
      );
    }

    if (
      !mapping.date ||
      (!mapping.description && !mapping.merchant) ||
      (!mapping.amount && !mapping.debit && !mapping.credit)
    ) {
      redirect(
        "/imports?error=Date, description or merchant, and amount fields must be mapped"
      );
    }

    const [
      { data: categoryRules, error: categoryRulesError },
      { data: categorizedHistory, error: categorizedHistoryError },
    ] = await Promise.all([
      supabase
        .from("category_rules")
        .select(
          "category_id, match_field, match_type, match_value, priority"
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("transactions")
        .select("category_id, description, merchant")
        .eq("user_id", user.id)
        .not("category_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    if (categoryRulesError || categorizedHistoryError) {
      redirect(
        `/imports?error=${encodeURIComponent(
          categoryRulesError?.message ??
            categorizedHistoryError?.message ??
            "Could not load category suggestions"
        )}`
      );
    }

    const rules = (categoryRules ?? []) as CategoryRule[];
    const history =
      (categorizedHistory ?? []) as CategorizedTransaction[];

    const normalizedRows = parsedRows.map((row, index) => {
      const date = parseDate(row[mapping.date]);

      const description = mapping.description
        ? stringValue(row[mapping.description])
        : "";

      const merchant = mapping.merchant
        ? stringValue(row[mapping.merchant])
        : "";

      const amount = parseAmount(row, mapping);

      const mappedCurrency = mapping.currency
        ? stringValue(row[mapping.currency])
        : "";

      const currency =
        mappedCurrency || account.currency || "MXN";

      const errorMessages: string[] = [];

      if (!date) {
        errorMessages.push("Invalid or missing date");
      }

      if (!description && !merchant) {
        errorMessages.push("Missing description");
      }

      if (amount === null || amount === 0) {
        errorMessages.push("Invalid or missing amount");
      }

      const fingerprint =
        date && amount !== null
          ? createFingerprint({
              accountId,
              date,
              amount,
              description,
              merchant,
              currency,
            })
          : null;

      const categorySuggestion = findCategorySuggestion({
        description,
        merchant,
        rules,
        history,
      });

      return {
        rowNumber: index + 2,
        date,
        description: description || merchant,
        merchant: merchant || null,
        amount,
        currency: currency.toUpperCase(),
        fingerprint,
        categoryId: categorySuggestion.categoryId,
        categorySource: categorySuggestion.categorySource,
        rawData: row,
        errorMessage:
          errorMessages.length > 0 ? errorMessages.join("; ") : null,
      };
    });

    const validRows = normalizedRows.filter(
      (row) =>
        row.date &&
        row.amount !== null &&
        row.fingerprint &&
        !row.errorMessage
    );

    const existingMatchKeys = new Set<string>();

    if (validRows.length > 0) {
      const dates = validRows.map((row) => row.date as string);
      const minimumDate = dates.sort()[0];
      const maximumDate = dates.sort().at(-1) as string;

      const { data: existingTransactions, error } = await supabase
        .from("transactions")
        .select("id, date, amount, description, merchant, currency")
        .eq("account_id", accountId)
        .eq("user_id", user.id)
        .gte("date", minimumDate)
        .lte("date", maximumDate);

      if (error) {
        redirect(
          `/imports?error=${encodeURIComponent(error.message)}`
        );
      }

      for (const transaction of existingTransactions ?? []) {
        existingMatchKeys.add(
          createFingerprint({
            accountId,
            date: transaction.date,
            amount: Number(transaction.amount),
            description: transaction.description ?? "",
            merchant: transaction.merchant ?? "",
            currency: transaction.currency,
          })
        );
      }
    }

    const fingerprintsInsideFile = new Set<string>();

    const preparedRows = normalizedRows.map((row) => {
      let status = "ready";
      const errorMessage = row.errorMessage;

      if (errorMessage || !row.fingerprint) {
        status = "error";
      } else if (
        existingMatchKeys.has(row.fingerprint) ||
        fingerprintsInsideFile.has(row.fingerprint)
      ) {
        status = "duplicate";
      }

      if (row.fingerprint) {
        fingerprintsInsideFile.add(row.fingerprint);
      }

      return {
        ...row,
        status,
        errorMessage,
      };
    });

    const readyRows = preparedRows.filter(
      (row) => row.status === "ready"
    ).length;

    const duplicateRows = preparedRows.filter(
      (row) => row.status === "duplicate"
    ).length;

    const errorRows = preparedRows.filter(
      (row) => row.status === "error"
    ).length;

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        user_id: user.id,
        account_id: accountId,
        file_name: fileName,
        file_type: "csv",
        status: "review",
        total_rows: preparedRows.length,
        ready_rows: readyRows,
        duplicate_rows: duplicateRows,
        error_rows: errorRows,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      redirect(
        `/imports?error=${encodeURIComponent(
          batchError?.message ?? "Could not create import batch"
        )}`
      );
    }

    const rowsToInsert = preparedRows.map((row) => ({
      batch_id: batch.id,
      user_id: user.id,
      row_number: row.rowNumber,
      transaction_date: row.date,
      description: row.description || null,
      merchant: row.merchant,
      amount: row.amount,
      currency: row.currency,
      fingerprint: row.fingerprint,
      category_id: row.categoryId,
      category_source: row.categorySource,
      raw_data: row.rawData,
      status: row.status,
      error_message: row.errorMessage,
    }));

    const { error: rowsError } = await supabase
      .from("transaction_import_rows")
      .insert(rowsToInsert);

    if (rowsError) {
      await supabase
        .from("import_batches")
        .delete()
        .eq("id", batch.id)
        .eq("user_id", user.id);

      redirect(
        `/imports?error=${encodeURIComponent(rowsError.message)}`
      );
    }

    revalidatePath("/imports");
    redirect(
      `/imports?success=${encodeURIComponent(
        `Batch created: ${readyRows} ready, ${duplicateRows} duplicates, ${errorRows} errors`
      )}`
    );
  }

  const dataError = accountsError || batchesError;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Plumber
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Imports
            </h1>
            <p className="mt-2 text-muted-foreground">
              Upload CSV transactions into a review staging area.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
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

        {params.success ? (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {params.success}
          </div>
        ) : null}

        {dataError ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load imports: {dataError.message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV</CardTitle>
              <CardDescription>
                The file is parsed locally before normalized rows are staged.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <CsvImportForm
                accounts={accounts ?? []}
                action={createImportBatch}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent import batches</CardTitle>
              <CardDescription>
                Review summaries for the latest CSV uploads.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!recentBatches || recentBatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No import batches yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentBatches.map((batch) => (
                    <div
                      className="rounded-lg border p-4"
                      key={batch.id}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{batch.file_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Intl.DateTimeFormat("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(batch.created_at))}
                          </p>
                        </div>

                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                          {batch.status}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                        <div>
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-medium">{batch.total_rows}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Ready</p>
                          <p className="font-medium">{batch.ready_rows}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Duplicates</p>
                          <p className="font-medium">{batch.duplicate_rows}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Errors</p>
                          <p className="font-medium">{batch.error_rows}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Imported</p>
                          <p className="font-medium">{batch.imported_rows}</p>
                        </div>
                      </div>

                      <Button asChild className="mt-4" size="sm" variant="outline">
                        <Link href={`/imports/${batch.id}`}>Review</Link>
                      </Button>
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
