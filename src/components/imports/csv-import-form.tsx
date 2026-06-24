"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";

import { Button } from "@/components/ui/button";

type Account = {
  id: string;
  name: string;
  currency: string;
};

type ParsedRow = Record<string, string>;

type CsvImportFormProps = {
  accounts: Account[];
  action: (formData: FormData) => void | Promise<void>;
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

export function CsvImportForm({
  accounts,
  action,
}: CsvImportFormProps) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState("");

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  function handleFile(file: File | undefined) {
    setRows([]);
    setHeaders([]);
    setParseError("");
    setFileName(file?.name ?? "");

    if (!file) {
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: normalizeHeader,
      complete: (result) => {
        if (result.errors.length > 0) {
          setParseError(
            result.errors
              .slice(0, 3)
              .map((error) => `Row ${error.row ?? "unknown"}: ${error.message}`)
              .join(" | ")
          );
        }

        const parsedRows = result.data.filter((row) =>
          Object.values(row).some((value) => String(value ?? "").trim() !== "")
        );

        const detectedHeaders =
          result.meta.fields?.filter(Boolean) ??
          Object.keys(parsedRows[0] ?? {});

        setRows(parsedRows);
        setHeaders(detectedHeaders);
      },
      error: (error) => {
        setParseError(error.message);
      },
    });
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="account_id">
            Destination account
          </label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            id="account_id"
            name="account_id"
            required
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="csv_file">
            CSV file
          </label>
          <input
            accept=".csv,text/csv"
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
            id="csv_file"
            onChange={(event) => handleFile(event.target.files?.[0])}
            type="file"
          />
        </div>

        {parseError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {parseError}
          </div>
        ) : null}

        <input name="file_name" type="hidden" value={fileName} />
        <input name="rows_json" type="hidden" value={JSON.stringify(rows)} />

        <Button
          className="w-full"
          disabled={accounts.length === 0 || rows.length === 0}
          type="submit"
        >
          Create import batch
        </Button>
      </form>

      {rows.length > 0 ? (
        <div className="space-y-3">
          <div>
            <p className="font-medium">CSV preview</p>
            <p className="text-sm text-muted-foreground">
              {rows.length} rows detected. Showing the first 10.
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {headers.map((header) => (
                    <th
                      className="whitespace-nowrap px-3 py-2 text-left font-medium"
                      key={header}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {previewRows.map((row, index) => (
                  <tr className="border-t" key={index}>
                    {headers.map((header) => (
                      <td
                        className="max-w-64 whitespace-nowrap px-3 py-2"
                        key={header}
                      >
                        {row[header] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Expected column names include date, description, merchant, amount,
            debit, credit, and currency. Column mapping will become configurable
            in a later step.
          </p>
        </div>
      ) : null}
    </div>
  );
}
