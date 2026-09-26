"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  classifyPlaidAccountAction,
  type ManualAccountFormState
} from "./actions";

const options = [
  ["CASH", "Cash"],
  ["INVESTED", "Invested"],
  ["PROPERTY", "Property"],
  ["DEBT", "Debt"]
] as const;

export function PlaidClassificationForm({
  accountId,
  accountName
}: {
  accountId: string;
  accountName: string;
}) {
  const fieldId = useId();
  const router = useRouter();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [state, action, pending] = useActionState<
    ManualAccountFormState,
    FormData
  >(classifyPlaidAccountAction, {});

  useEffect(() => {
    if (!state.success) return;
    statusRef.current?.focus();
    const refresh = window.setTimeout(() => router.refresh(), 800);
    return () => window.clearTimeout(refresh);
  }, [router, state.success]);

  return (
    <form className="classification-form" action={action}>
      <input type="hidden" name="accountId" value={accountId} />
      <div className="field">
        <label htmlFor={fieldId}>Account group for {accountName}</label>
        <select className="input" id={fieldId} name="classification" required>
          <option value="">Choose a group</option>
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p className="danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="positive" role="status" tabIndex={-1} ref={statusRef}>
          {state.success}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save account group"}
      </button>
    </form>
  );
}
