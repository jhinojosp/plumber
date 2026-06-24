"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Account = {
  id: string;
  name: string;
  currency: string;
};

type Category = {
  id: string;
  name: string;
  type: string;
};

type TransactionFormProps = {
  accounts: Account[];
  categories: Category[];
  action: (formData: FormData) => void | Promise<void>;
};

export function TransactionForm({
  accounts,
  categories,
  action,
}: TransactionFormProps) {
  const [transactionType, setTransactionType] = useState("expense");

  const filteredCategories = categories.filter(
    (category) => category.type === transactionType
  );

  const isTransfer = transactionType === "transfer";

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="account_id">
          {isTransfer ? "Source account" : "Account"}
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
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="transaction_type">
          Type
        </label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          id="transaction_type"
          name="transaction_type"
          onChange={(event) => setTransactionType(event.target.value)}
          value={transactionType}
          required
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>

      {isTransfer ? (
        <div className="space-y-2">
          <label
            className="text-sm font-medium"
            htmlFor="destination_account_id"
          >
            Destination account
          </label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            id="destination_account_id"
            name="destination_account_id"
            required
          >
            <option value="">Select destination account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="category_id">
            Category
          </label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            id="category_id"
            name="category_id"
          >
            <option value="">No category</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      )}

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
          placeholder={isTransfer ? "e.g. Transfer to savings" : "e.g. Dinner"}
          required
        />
      </div>

      {!isTransfer ? (
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
      ) : null}

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

      <Button className="w-full" disabled={accounts.length === 0} type="submit">
        Add transaction
      </Button>
    </form>
  );
}
