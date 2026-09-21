import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireHousehold } from "@/server/households";
import { ConnectAccountButton } from "@/features/accounts/connect-account-button";
import { classificationLabel } from "@/features/accounts/account-model";
import {
  createManualAccountAction,
  updateManualAccountAction
} from "@/features/accounts/actions";
import { ConnectionControls } from "@/features/accounts/connection-controls";
import { connectionState } from "@/features/accounts/connection-status";
import { getAccountOverview } from "@/features/accounts/data";
import { ManualAccountForm } from "@/features/accounts/manual-account-form";
import {
  ArchiveManualAccount,
  PropertyDebtLinkForm,
  UnlinkPropertyDebt
} from "@/features/accounts/manual-account-controls";
import { PlaidLinkProvider } from "@/features/accounts/plaid-link-provider";
import { formatCurrency } from "@/lib/money";

export const metadata: Metadata = { title: "Accounts" };

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

export default async function AccountsPage() {
  const owner = await requireHousehold();
  const { accounts, connections, positionSummary, propertyGroups } =
    await getAccountOverview(owner.householdId);
  const today = new Date().toISOString().slice(0, 10);
  const properties = accounts.filter(
    (account) => account.classification === "PROPERTY"
  );
  const debts = accounts.filter((account) => account.classification === "DEBT");

  return (
    <PlaidLinkProvider>
      <PageHeader title="Accounts" actions={<ConnectAccountButton />} />
      <div className="page-content">
        <section className="card stack" aria-labelledby="manual-account-title">
          <div>
            <span className="eyebrow">No bank connection required</span>
            <h2 id="manual-account-title">Add a manual account</h2>
            <p className="muted">
              Track cash, investments, property, or debt with a dated value.
            </p>
          </div>
          <ManualAccountForm
            action={createManualAccountAction}
            heading="Account details"
            submitLabel="Add manual account"
            today={today}
          />
        </section>

        <section className="stack" aria-labelledby="connections-title">
          <div className="section-heading">
            <h2 id="connections-title">
              {connections.length} bank{" "}
              {connections.length === 1 ? "connection" : "connections"}
            </h2>
            <span className="muted">
              Status and recovery for each institution
            </span>
          </div>
          <div className="connection-list">
            {connections.length === 0 ? (
              <p className="muted">
                No bank connections. Manual accounts remain available without
                Plaid.
              </p>
            ) : (
              connections.map((connection) => {
                const state = connectionState({
                  status: connection.status,
                  jobStatus: connection.job?.status ?? null,
                  jobAttempts: connection.job?.attempts ?? 0,
                  lastSyncedAt: connection.lastSyncedAt
                });
                const statusDescriptionId = `connection-${connection.id}-status`;
                const headingId = `connection-${connection.id}-title`;
                return (
                  <article
                    className="card connection-card"
                    key={connection.id}
                    aria-labelledby={headingId}
                  >
                    <div className="connection-card-header">
                      <div>
                        <span className="eyebrow">Plaid connection</span>
                        <h3 id={headingId}>{connection.institution}</h3>
                      </div>
                      <span className={`connection-state ${state.kind}`}>
                        {state.label}
                      </span>
                    </div>
                    <div id={statusDescriptionId}>
                      <p>{state.detail}</p>
                      <p className="muted">
                        {connection.lastSyncedAt ? (
                          <>
                            Last synced{" "}
                            <time
                              dateTime={connection.lastSyncedAt.toISOString()}
                            >
                              {dateTime.format(connection.lastSyncedAt)}
                            </time>
                          </>
                        ) : (
                          "No completed sync yet"
                        )}{" "}
                        · {connection.accountCount} active{" "}
                        {connection.accountCount === 1 ? "account" : "accounts"}
                      </p>
                    </div>
                    <ConnectionControls
                      itemId={connection.id}
                      institution={connection.institution}
                      action={state.action}
                      statusDescriptionId={statusDescriptionId}
                    />
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="stack" aria-labelledby="accounts-title">
          <div className="section-heading">
            <h2 id="accounts-title">
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
            </h2>
            <span className="muted">
              Signed positions from the latest recorded balance
            </span>
          </div>
          {positionSummary.totals.length > 0 ? (
            <div className="position-totals" aria-label="Net worth totals">
              {positionSummary.totals.map((total) => (
                <p key={total.currency}>
                  <span className="eyebrow">{total.currency} net worth</span>{" "}
                  <strong>
                    {formatCurrency(total.amount, total.currency)}
                  </strong>
                </p>
              ))}
              {!positionSummary.isComplete ? (
                <p className="warning">
                  Partial total: at least one account is missing a balance or
                  recognized currency.
                </p>
              ) : null}
            </div>
          ) : null}
          {accounts.length === 0 ? (
            <p className="muted">
              Add a manual account or connect a bank to begin.
            </p>
          ) : (
            <div className="account-grid">
              {accounts.map((account) => {
                const liability = account.classification === "DEBT";
                return (
                  <article className="card account-card" key={account.id}>
                    <span className="eyebrow">
                      {classificationLabel(account.classification)} ·{" "}
                      {account.institution}
                    </span>
                    <h3>{account.name}</h3>
                    <span
                      className={
                        liability ? "card-value warning" : "card-value"
                      }
                    >
                      {account.currentBalance !== null && account.currency
                        ? formatCurrency(
                            account.currentBalance,
                            account.currency
                          )
                        : "Balance unavailable"}
                    </span>
                    <span className="muted">
                      {account.mask
                        ? `•••• ${account.mask}`
                        : account.source === "MANUAL"
                          ? "Manual balance"
                          : "No account mask"}
                    </span>
                    {account.source === "MANUAL" ? (
                      <details className="account-details">
                        <summary>Edit or archive</summary>
                        <ManualAccountForm
                          action={updateManualAccountAction}
                          heading={`Edit ${account.name}`}
                          submitLabel="Save account"
                          today={today}
                          account={account}
                        />
                        <ArchiveManualAccount
                          accountId={account.id}
                          accountName={account.name}
                        />
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card stack" aria-labelledby="property-title">
          <div>
            <span className="eyebrow">Separate records, reconciled equity</span>
            <h2 id="property-title">Property and related debt</h2>
          </div>
          {properties.length > 0 && debts.length > 0 ? (
            <PropertyDebtLinkForm properties={properties} debts={debts} />
          ) : (
            <p className="muted">
              Add both a Property account and a Debt account to link them.
            </p>
          )}
          {propertyGroups.map((group) => {
            const known =
              group.property.currentBalance !== null &&
              Boolean(group.property.currency) &&
              group.debts.every(
                (debt) =>
                  debt.currentBalance !== null &&
                  debt.currency === group.property.currency
              );
            const equity = known
              ? group.property.currentBalance! +
                group.debts.reduce(
                  (total, debt) => total + debt.currentBalance!,
                  0
                )
              : null;
            return (
              <article className="property-pair" key={group.property.id}>
                <h3>{group.property.name}</h3>
                <p>
                  Property value:{" "}
                  <strong>
                    {group.property.currentBalance !== null &&
                    group.property.currency
                      ? formatCurrency(
                          group.property.currentBalance,
                          group.property.currency
                        )
                      : "Unavailable"}
                  </strong>
                </p>
                {group.debts.map((debt) => (
                  <div className="property-debt-row" key={debt.linkId}>
                    <p>
                      {debt.name}:{" "}
                      <strong>
                        {debt.currentBalance !== null && debt.currency
                          ? formatCurrency(debt.currentBalance, debt.currency)
                          : "Unavailable"}
                      </strong>
                    </p>
                    <UnlinkPropertyDebt
                      linkId={debt.linkId}
                      propertyName={group.property.name}
                      debtName={debt.name}
                    />
                  </div>
                ))}
                <p className="property-equity">
                  Derived equity:{" "}
                  <strong>
                    {equity !== null && group.property.currency
                      ? formatCurrency(equity, group.property.currency)
                      : "Unavailable until balances share one currency"}
                  </strong>
                </p>
              </article>
            );
          })}
        </section>
      </div>
    </PlaidLinkProvider>
  );
}
