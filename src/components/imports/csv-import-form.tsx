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

type MappingField =
  | "date"
  | "description"
  | "merchant"
  | "amount"
  | "debit"
  | "credit"
  | "currency";

type ColumnMapping = Record<MappingField, string>;

const emptyMapping: ColumnMapping = {
  date: "",
  description: "",
  merchant: "",
  amount: "",
  debit: "",
  credit: "",
  currency: "",
};

const fieldLabels: Record<MappingField, string> = {
  date: "Date",
  description: "Description",
  merchant: "Merchant",
  amount: "Amount",
  debit: "Debit / Charge",
  credit: "Credit / Deposit",
  currency: "Currency",
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function findHeader(
  headers: string[],
  candidates: string[]
) {
  return (
    headers.find((header) =>
      candidates.includes(header.toLowerCase())
    ) ??
    headers.find((header) =>
      candidates.some((candidate) =>
        header.toLowerCase().includes(candidate)
      )
    ) ??
    ""
  );
}

function suggestMapping(headers: string[]): ColumnMapping {
  return {
    date: findHeader(headers, [
      "date",
      "fecha",
      "transaction_date",
      "posting_date",
      "posted_date",
      "fecha_operacion",
      "fecha_movimiento",
    ]),
    description: findHeader(headers, [
      "description",
      "descripcion",
      "concept",
      "concepto",
      "details",
      "detalle",
      "memo",
      "movimiento",
    ]),
    merchant: findHeader(headers, [
      "merchant",
      "comercio",
      "payee",
      "beneficiary",
      "beneficiario",
      "establishment",
      "establecimiento",
    ]),
    amount: findHeader(headers, [
      "amount",
      "importe",
      "monto",
      "total",
    ]),
    debit: findHeader(headers, [
      "debit",
      "cargo",
      "cargos",
      "withdrawal",
      "retiro",
    ]),
    credit: findHeader(headers, [
      "credit",
      "abono",
      "abonos",
      "deposit",
      "deposito",
    ]),
    currency: findHeader(headers, [
      "currency",
      "moneda",
      "divisa",
    ]),
  };
}

export function CsvImportForm({
  accounts,
  action,
}: CsvImportFormProps) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] =
    useState<ColumnMapping>(emptyMapping);
  const [parseError, setParseError] = useState("");

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  const mappingIsValid =
    Boolean(mapping.date) &&
    Boolean(mapping.description || mapping.merchant) &&
    Boolean(
      mapping.amount ||
        mapping.debit ||
        mapping.credit
    );

  function updateMapping(
    field: MappingField,
    value: string
  ) {
    setMapping((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleFile(file: File | undefined) {
    setRows([]);
    setHeaders([]);
    setMapping(emptyMapping);
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
              .map(
                (error) =>
                  `Row ${error.row ?? "unknown"}: ${error.message}`
              )
              .join(" | ")
          );
        }

        const parsedRows = result.data.filter((row) =>
          Object.values(row).some(
            (value) => String(value ?? "").trim() !== ""
          )
        );

        const detectedHeaders =
          result.meta.fields?.filter(Boolean) ??
          Object.keys(parsedRows[0] ?? {});

        setRows(parsedRows);
        setHeaders(detectedHeaders);
        setMapping(suggestMapping(detectedHeaders));
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
          <label
            className="text-sm font-medium"
            htmlFor="account_id"
          >
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
          <label
            className="text-sm font-medium"
            htmlFor="csv_file"
          >
            CSV file
          </label>

          <input
            accept=".csv,text/csv"
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
            id="csv_file"
            onChange={(event) =>
              handleFile(event.target.files?.[0])
            }
            type="file"
          />
        </div>

        {parseError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {parseError}
          </div>
        ) : null}

        {headers.length > 0 ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">Column mapping</p>
              <p className="text-sm text-muted-foreground">
                Confirm which CSV column corresponds to each
                standardized field.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(
                Object.keys(fieldLabels) as MappingField[]
              ).map((field) => (
                <div className="space-y-1" key={field}>
                  <label
                    className="text-sm font-medium"
                    htmlFor={`mapping-${field}`}
                  >
                    {fieldLabels[field]}
                  </label>

                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    id={`mapping-${field}`}
                    onChange={(event) =>
                      updateMapping(field, event.target.value)
                    }
                    value={mapping[field]}
                  >
                    <option value="">Not mapped</option>

                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Date is required. Description or merchant is
              required. Use either Amount, or Debit and Credit
              columns.
            </p>
          </div>
        ) : null}

        <input
          name="file_name"
          type="hidden"
          value={fileName}
        />

        <input
          name="rows_json"
          type="hidden"
          value={JSON.stringify(rows)}
        />

        <input
          name="mapping_json"
          type="hidden"
          value={JSON.stringify(mapping)}
        />

        <Button
          className="w-full"
          disabled={
            accounts.length === 0 ||
            rows.length === 0 ||
            !mappingIsValid
          }
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
        </div>
      ) : null}
    </div>
  );
}
