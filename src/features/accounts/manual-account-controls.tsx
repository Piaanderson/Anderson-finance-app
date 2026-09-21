"use client";

import { useActionState } from "react";
import {
  archiveManualAccountAction,
  linkPropertyDebtAction,
  type ManualAccountFormState,
  unlinkPropertyDebtAction
} from "./actions";

export function ArchiveManualAccount({
  accountId,
  accountName
}: {
  accountId: string;
  accountName: string;
}) {
  const [state, action, pending] = useActionState<
    ManualAccountFormState,
    FormData
  >(archiveManualAccountAction, {});

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Archive ${accountName}? Its valuation history will be preserved.`
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
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
      <button className="button secondary" type="submit" disabled={pending}>
        {pending ? "Archiving…" : `Archive ${accountName}`}
      </button>
    </form>
  );
}

export function PropertyDebtLinkForm({
  properties,
  debts
}: {
  properties: Array<{ id: string; name: string }>;
  debts: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState<
    ManualAccountFormState,
    FormData
  >(linkPropertyDebtAction, {});

  return (
    <form className="property-link-form" action={action}>
      <div className="field">
        <label htmlFor="property-link-property">Property</label>
        <select
          className="input"
          id="property-link-property"
          name="propertyAccountId"
          required
        >
          <option value="">Choose a property</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="property-link-debt">Related debt</label>
        <select
          className="input"
          id="property-link-debt"
          name="debtAccountId"
          required
        >
          <option value="">Choose a debt</option>
          {debts.map((debt) => (
            <option key={debt.id} value={debt.id}>
              {debt.name}
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
        <p className="positive" role="status">
          {state.success}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Linking…" : "Link property and debt"}
      </button>
    </form>
  );
}

export function UnlinkPropertyDebt({
  linkId,
  propertyName,
  debtName
}: {
  linkId: string;
  propertyName: string;
  debtName: string;
}) {
  const [state, action, pending] = useActionState<
    ManualAccountFormState,
    FormData
  >(unlinkPropertyDebtAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="linkId" value={linkId} />
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
        className="button secondary"
        type="submit"
        disabled={pending}
        aria-label={`Unlink ${debtName} from ${propertyName}`}
      >
        {pending ? "Unlinking…" : "Unlink"}
      </button>
    </form>
  );
}
