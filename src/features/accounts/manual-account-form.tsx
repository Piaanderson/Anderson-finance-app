"use client";

import { useActionState, useId, useState, useTransition } from "react";
import type { FinancialAccountClassification } from "@prisma/client";
import type { ManualAccountFormState } from "./actions";

type ManualAccountAction = (
  state: ManualAccountFormState,
  formData: FormData
) => Promise<ManualAccountFormState>;

type ManualAccountFormProps = {
  action: ManualAccountAction;
  heading: string;
  submitLabel: string;
  today: string;
  account?: {
    id: string;
    name: string;
    classification: FinancialAccountClassification;
    currentBalance: number | null;
    currency: string | null;
  };
};

const options = [
  ["CASH", "Cash"],
  ["INVESTED", "Invested"],
  ["PROPERTY", "Property"],
  ["DEBT", "Debt"]
] as const;

export function ManualAccountForm({
  action,
  heading,
  submitLabel,
  today,
  account
}: ManualAccountFormProps) {
  const baseId = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const [transitionPending, startTransition] = useTransition();
  const [classification, setClassification] = useState(
    account?.classification ?? "CASH"
  );
  const fieldId = (name: string) => `${baseId}-${name}`;
  const errorId = (name: string) => `${fieldId(name)}-error`;
  const fieldError = (name: string) => state.fieldErrors?.[name];
  const debt = classification === "DEBT";
  const defaultEntryBalance =
    account?.currentBalance === null || account?.currentBalance === undefined
      ? undefined
      : debt
        ? Math.abs(account.currentBalance)
        : account.currentBalance;

  return (
    <form
      className="manual-account-form"
      action={formAction}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <h3>{heading}</h3>
      {account ? (
        <input type="hidden" name="accountId" value={account.id} />
      ) : null}
      <div className="field">
        <label htmlFor={fieldId("name")}>Account name</label>
        <input
          className="input"
          id={fieldId("name")}
          name="name"
          defaultValue={account?.name}
          required
          minLength={2}
          maxLength={80}
          aria-invalid={fieldError("name") ? true : undefined}
          aria-describedby={fieldError("name") ? errorId("name") : undefined}
        />
        {fieldError("name") ? (
          <p className="danger" id={errorId("name")}>
            {fieldError("name")}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={fieldId("classification")}>Account type</label>
        <select
          className="input"
          id={fieldId("classification")}
          name="classification"
          value={classification}
          onChange={(event) =>
            setClassification(
              event.target.value as FinancialAccountClassification
            )
          }
          required
          aria-invalid={fieldError("classification") ? true : undefined}
          aria-describedby={
            fieldError("classification") ? errorId("classification") : undefined
          }
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {fieldError("classification") ? (
          <p className="danger" id={errorId("classification")}>
            {fieldError("classification")}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={fieldId("entryBalance")}>
          {debt ? "Amount owed" : "Current value"}
        </label>
        <input
          className="input"
          id={fieldId("entryBalance")}
          name="entryBalance"
          type="number"
          step="0.01"
          min={debt ? "0" : undefined}
          defaultValue={defaultEntryBalance}
          required
          aria-invalid={fieldError("entryBalance") ? true : undefined}
          aria-describedby={[
            `${fieldId("entryBalance")}-hint`,
            fieldError("entryBalance") ? errorId("entryBalance") : null
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <p className="muted" id={`${fieldId("entryBalance")}-hint`}>
          {debt
            ? "Enter what you owe as a positive amount. Currents stores it as a negative net-worth position."
            : "Use a negative value only when this asset is overdrawn."}
        </p>
        {fieldError("entryBalance") ? (
          <p className="danger" id={errorId("entryBalance")}>
            {fieldError("entryBalance")}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={fieldId("isoCurrencyCode")}>Currency</label>
        <input
          className="input currency-input"
          id={fieldId("isoCurrencyCode")}
          name="isoCurrencyCode"
          defaultValue={account?.currency ?? "USD"}
          required
          minLength={3}
          maxLength={3}
          autoCapitalize="characters"
          aria-invalid={fieldError("isoCurrencyCode") ? true : undefined}
          aria-describedby={
            fieldError("isoCurrencyCode")
              ? errorId("isoCurrencyCode")
              : undefined
          }
        />
        {fieldError("isoCurrencyCode") ? (
          <p className="danger" id={errorId("isoCurrencyCode")}>
            {fieldError("isoCurrencyCode")}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={fieldId("effectiveDate")}>Value effective date</label>
        <input
          className="input"
          id={fieldId("effectiveDate")}
          name="effectiveDate"
          type="date"
          defaultValue={today}
          max={today}
          required
          aria-invalid={fieldError("effectiveDate") ? true : undefined}
          aria-describedby={
            fieldError("effectiveDate") ? errorId("effectiveDate") : undefined
          }
        />
        {fieldError("effectiveDate") ? (
          <p className="danger" id={errorId("effectiveDate")}>
            {fieldError("effectiveDate")}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p className="danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="positive" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        className="button"
        type="submit"
        disabled={pending || transitionPending}
      >
        {pending || transitionPending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
