import type { Metadata } from "next";
import { requireHousehold } from "@/server/households";
import { AccountRow } from "@/features/accounts/account-row";
import { ConnectAccountButton } from "@/features/accounts/connect-account-button";
import { createManualAccountAction } from "@/features/accounts/actions";
import { ConnectionControls } from "@/features/accounts/connection-controls";
import { connectionState } from "@/features/accounts/connection-status";
import {
  ledgerEquationAmount,
  ledgerEquationCurrencies,
  ledgerEquationHasSource,
  type LedgerEquationClassification
} from "@/features/accounts/accounts-experience";
import { getAccountOverview } from "@/features/accounts/data";
import { ManualAccountForm } from "@/features/accounts/manual-account-form";
import { PropertyDebtLinkForm } from "@/features/accounts/manual-account-controls";
import { NetWorthHistory } from "@/features/accounts/net-worth-history";
import { PlaidLinkProvider } from "@/features/accounts/plaid-link-provider";
import { PropertyRow } from "@/features/accounts/property-row";
import { formatDecimalCurrency } from "@/lib/money";

export const metadata: Metadata = { title: "Accounts" };

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

const groups = [
  {
    classification: "CASH",
    label: "Cash",
    addLabel: "+ Add a cash account"
  },
  {
    classification: "INVESTED",
    label: "Invested",
    addLabel: "+ Add an investment account"
  },
  {
    classification: "DEBT",
    label: "Debt",
    addLabel: "+ Add a card or loan"
  }
] as const;

const monthLabel = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

function absoluteAmount(value: string) {
  return value.startsWith("-") ? value.slice(1) : value;
}

function CurrencyTotals({
  totals,
  unavailable = "No known positions"
}: {
  totals: Array<{ currency: string; amount: string }>;
  unavailable?: string;
}) {
  return totals.length ? (
    <span className="currency-totals">
      {totals.map((total) => (
        <strong key={total.currency}>
          {formatDecimalCurrency(total.amount, total.currency)}
          {totals.length > 1 ? ` ${total.currency}` : ""}
        </strong>
      ))}
    </span>
  ) : (
    <strong>{unavailable}</strong>
  );
}

export default async function AccountsPage() {
  const owner = await requireHousehold();
  const now = new Date();
  const {
    accounts,
    connections,
    positionSummary,
    ledgerSummary,
    propertyGroups,
    netWorthHistory
  } = await getAccountOverview(owner.householdId, now);
  const today = now.toISOString().slice(0, 10);
  const properties = accounts.filter(
    (account) => account.classification === "PROPERTY"
  );
  const debts = accounts.filter((account) => account.classification === "DEBT");
  const unclassified = accounts.filter(
    (account) => account.classification === "UNCLASSIFIED"
  );
  const incompleteIds = new Set([
    ...positionSummary.missingBalanceAccountIds,
    ...positionSummary.missingCurrencyAccountIds
  ]);
  const incompleteAccounts = accounts.filter((account) =>
    incompleteIds.has(account.id)
  );
  const linkedDebtIds = new Set(ledgerSummary.linkedDebtAccountIds);
  const ambiguousLinkedDebtIds = new Set(
    ledgerSummary.ambiguousLinkedDebtAccountIds
  );
  const uncombinedLinkedDebtIds = new Set(
    ledgerSummary.uncombinedLinkedDebtAccountIds
  );
  const allLinkedDebtIds = new Set(
    propertyGroups.flatMap((group) => group.debts.map((debt) => debt.id))
  );
  const unlinkedDebts = debts.filter(
    (account) => !allLinkedDebtIds.has(account.id)
  );
  const equationCurrencies = ledgerEquationCurrencies(accounts);
  const uncombinedPropertyGroups = propertyGroups.filter(
    (group) =>
      group.combineInLedger === false || group.equity.status === "unavailable"
  );
  const uncombinedPropertyCurrencies = new Set(
    uncombinedPropertyGroups
      .map((group) => group.property.currency)
      .filter((currency): currency is string => Boolean(currency))
  );
  const hasUncombinedProperties = uncombinedPropertyGroups.length > 0;
  const equationAmount = (
    classification: LedgerEquationClassification,
    currency: string
  ) => {
    const amount = ledgerEquationAmount(
      ledgerSummary.summary,
      accounts,
      classification,
      currency
    );
    if (amount === null) return "unavailable";
    return formatDecimalCurrency(
      classification === "DEBT" ? absoluteAmount(amount) : amount,
      currency
    );
  };
  const connectedAccounts = accounts.filter(
    (account) => account.source === "PLAID"
  );
  const manualAccounts = accounts.filter(
    (account) => account.source === "MANUAL"
  );
  const lastSyncedAt = connections
    .map((connection) => connection.lastSyncedAt)
    .filter((value): value is Date => value !== null)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const connectionIssues = connections.filter((connection) => {
    const state = connectionState({
      status: connection.status,
      jobStatus: connection.job?.status ?? null,
      jobAttempts: connection.job?.attempts ?? 0,
      lastSyncedAt: connection.lastSyncedAt,
      now
    });
    return state.kind === "error" || state.kind === "login-required";
  });

  return (
    <PlaidLinkProvider>
      <div className="accounts-integrated-page">
        <header className="accounts-integrated-header">
          <div className="accounts-header-main">
            <div className="accounts-month-context">
              <div
                className="accounts-month-navigation"
                aria-label="Account month"
              >
                <button
                  type="button"
                  disabled
                  aria-label="Previous month unavailable"
                  title="Historical account-month views are unavailable"
                >
                  ‹
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="Next month unavailable"
                  title="Future account-month views are unavailable"
                >
                  ›
                </button>
              </div>
              <div>
                <span className="eyebrow">
                  {monthLabel.format(now)} · day {now.getUTCDate()} of{" "}
                  {new Date(
                    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
                  ).getUTCDate()}
                </span>
                <h1>Accounts</h1>
                <strong>
                  {accounts.length} active{" "}
                  {accounts.length === 1 ? "account" : "accounts"}
                </strong>
              </div>
              <a className="accounts-today-link" href="/accounts">
                Today
              </a>
            </div>
            <div className="accounts-header-actions">
              <span className="accounts-refresh-action">
                <button
                  className="button secondary"
                  type="button"
                  disabled
                  aria-describedby="refresh-all-unavailable"
                >
                  Refresh all
                </button>
                <small id="refresh-all-unavailable">
                  Global refresh unavailable
                </small>
              </span>
              <a className="button" href="#add-account-options">
                Add account
              </a>
            </div>
          </div>
          <div className="accounts-status-line" role="status">
            <span>
              <i className="is-connected" aria-hidden="true" />
              {connectedAccounts.length} connected
              {lastSyncedAt ? (
                <>
                  {" "}
                  · refreshed{" "}
                  <time dateTime={lastSyncedAt.toISOString()}>
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric",
                      minute: "2-digit"
                    }).format(lastSyncedAt)}
                  </time>
                </>
              ) : (
                " · no completed refresh"
              )}
            </span>
            <span className="accounts-status-divider" aria-hidden="true" />
            <span>
              <i className="is-manual" aria-hidden="true" />
              {manualAccounts.length} manual
            </span>
            <span className="accounts-status-divider" aria-hidden="true" />
            <span>
              {connectionIssues.length
                ? `${connectionIssues.length} connection ${
                    connectionIssues.length === 1 ? "needs" : "need"
                  } attention`
                : incompleteAccounts.length
                  ? "Some current positions are incomplete"
                  : "Schedules and projections are unavailable"}
            </span>
          </div>
        </header>

        <div
          className="accounts-ledger"
          role="region"
          aria-label="Account ledger"
        >
          <div className="accounts-ledger-columns" aria-hidden="true">
            <span>Account</span>
            <span>Connection</span>
            <span>Balance today</span>
            <span>Before month end</span>
            <span>Projected</span>
          </div>

          {groups.map((group) => {
            const groupAccounts = accounts.filter(
              (account) =>
                account.classification === group.classification &&
                !linkedDebtIds.has(account.id)
            );
            const groupTotals =
              ledgerSummary.summary.totalsByClassification[
                group.classification
              ];
            const partial = groupAccounts.some((account) =>
              incompleteIds.has(account.id)
            );
            return (
              <section
                className="account-ledger-group"
                aria-labelledby={`account-group-${group.classification}`}
                key={group.classification}
              >
                <div className="account-ledger-group-heading">
                  <h2 id={`account-group-${group.classification}`}>
                    {group.label}
                  </h2>
                  <CurrencyTotals totals={groupTotals} />
                  <span>
                    {groupAccounts.length}{" "}
                    {groupAccounts.length === 1 ? "account" : "accounts"}
                    {partial ? " · partial positions" : ""}
                    {group.classification === "DEBT" && linkedDebtIds.size
                      ? ` · ${linkedDebtIds.size} linked ${
                          linkedDebtIds.size === 1 ? "debt is" : "debts are"
                        } shown with Property`
                      : ""}
                    {group.classification === "DEBT" &&
                    ambiguousLinkedDebtIds.size
                      ? ` · ${ambiguousLinkedDebtIds.size} ${
                          ambiguousLinkedDebtIds.size === 1
                            ? "debt has"
                            : "debts have"
                        } conflicting property links`
                      : ""}
                    {group.classification === "DEBT" &&
                    uncombinedLinkedDebtIds.size &&
                    !ambiguousLinkedDebtIds.size
                      ? ` · ${uncombinedLinkedDebtIds.size} linked ${
                          uncombinedLinkedDebtIds.size === 1
                            ? "debt remains"
                            : "debts remain"
                        } separate because equity is unavailable`
                      : ""}
                  </span>
                </div>
                <div className="account-list">
                  {groupAccounts.length ? (
                    groupAccounts.map((account) => (
                      <AccountRow
                        account={account}
                        today={today}
                        key={account.id}
                      />
                    ))
                  ) : (
                    <p className="account-group-empty muted">
                      No active {group.label.toLowerCase()} accounts.
                    </p>
                  )}
                </div>
                <a className="account-group-add" href="#add-account-options">
                  {group.addLabel}
                </a>
              </section>
            );
          })}

          <section
            className="account-ledger-group property-ledger-group"
            aria-labelledby="account-group-PROPERTY"
          >
            <div className="account-ledger-group-heading">
              <h2 id="account-group-PROPERTY">Property</h2>
              <CurrencyTotals
                totals={ledgerSummary.summary.totalsByClassification.PROPERTY}
                unavailable="Property unavailable"
              />
              <span>
                {hasUncombinedProperties
                  ? "Property value · equity unavailable due to conflicting or incomplete links"
                  : "equity · property and linked debt read as one line"}
              </span>
            </div>
            {properties.length ? (
              properties.map((property) => {
                const propertyGroup = propertyGroups.find(
                  (candidate) => candidate.property.id === property.id
                );
                const linkedDebts = propertyGroup
                  ? accounts.filter((account) =>
                      propertyGroup.debts.some((debt) => debt.id === account.id)
                    )
                  : [];
                return (
                  <PropertyRow
                    account={property}
                    propertyGroup={propertyGroup}
                    linkedDebts={linkedDebts}
                    today={today}
                    key={property.id}
                  />
                );
              })
            ) : (
              <p className="account-group-empty muted">
                No active property accounts.
              </p>
            )}
            <a className="account-group-add" href="#add-account-options">
              + Add a property
            </a>
          </section>

          <section
            className="accounts-net-worth-equation"
            aria-labelledby="accounts-net-worth-title"
          >
            <div>
              {equationCurrencies.length ? (
                equationCurrencies.map((currency) => {
                  return (
                    <p key={currency}>
                      Cash {equationAmount("CASH", currency)} + Invested{" "}
                      {equationAmount("INVESTED", currency)} +{" "}
                      {uncombinedPropertyCurrencies.has(currency)
                        ? "Property value / home equity"
                        : "Home equity"}{" "}
                      {equationAmount("PROPERTY", currency)} − Debt{" "}
                      {equationAmount("DEBT", currency)}
                      {ledgerEquationHasSource(
                        accounts,
                        "UNCLASSIFIED",
                        currency
                      )
                        ? ` + Unclassified ${equationAmount(
                            "UNCLASSIFIED",
                            currency
                          )}`
                        : ""}
                    </p>
                  );
                })
              ) : (
                <p>Net-worth equation unavailable</p>
              )}
              {!ledgerSummary.summary.isComplete ? (
                <div className="warning account-equation-warning" role="status">
                  <strong>Partial net worth</strong>
                  <span>
                    Missing values or currencies are not treated as zero.
                  </span>
                </div>
              ) : null}
            </div>
            <div className="accounts-net-worth-total">
              <span id="accounts-net-worth-title">
                {ledgerSummary.summary.isComplete
                  ? "Net worth"
                  : "Partial net worth"}
              </span>
              <CurrencyTotals
                totals={positionSummary.totals}
                unavailable="Unavailable"
              />
              <small>
                {ledgerSummary.summary.isComplete
                  ? "Monthly movement unavailable"
                  : "Known subtotal · monthly movement unavailable"}
              </small>
            </div>
          </section>
          {equationCurrencies.length > 1 ? (
            <p className="accounts-currency-note">
              Currency totals stay separate. Currents does not apply an implicit
              exchange rate.
            </p>
          ) : null}
        </div>

        {unclassified.length ? (
          <section
            className="account-group account-review-needed accounts-secondary"
            aria-labelledby="unclassified-title"
          >
            <div className="account-group-heading">
              <div>
                <span className="eyebrow">Review needed</span>
                <h2 id="unclassified-title">Needs classification</h2>
              </div>
              <CurrencyTotals
                totals={positionSummary.totalsByClassification.UNCLASSIFIED}
                unavailable="Contribution unavailable"
              />
            </div>
            <p className="warning">
              Plaid did not provide a product type Currents can classify safely.
              These signed positions remain in net worth but outside the four
              group subtotals until you choose a group.
            </p>
            <div className="account-list">
              {unclassified.map((account) => (
                <AccountRow account={account} today={today} key={account.id} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="accounts-secondary">
          <NetWorthHistory history={netWorthHistory} />
        </section>

        <section
          className="card stack accounts-secondary"
          id="add-account-options"
          aria-labelledby="add-account-title"
        >
          <div>
            <span className="eyebrow">Connected or manual</span>
            <h2 id="add-account-title">Add an account</h2>
            <p className="muted">
              Connect a bank securely, or track a dated value without a bank
              connection.
            </p>
          </div>
          <div className="button-row">
            <ConnectAccountButton />
          </div>
          <ManualAccountForm
            action={createManualAccountAction}
            heading="Add a manual account"
            submitLabel="Add manual account"
            today={today}
          />
        </section>

        <section
          className="card stack accounts-secondary"
          aria-labelledby="property-link-title"
        >
          <div>
            <span className="eyebrow">Separate source records</span>
            <h2 id="property-link-title">Link property and related debt</h2>
            <p className="muted">
              Linking derives equity while the property and mortgage remain
              separate source records. Linked debt is shown with Property to
              avoid double-counting it in the visual equation.
            </p>
          </div>
          {properties.length > 0 && debts.length > 0 ? (
            <PropertyDebtLinkForm
              properties={properties}
              debts={unlinkedDebts}
            />
          ) : (
            <p className="muted">
              Add both a Property account and a Debt account to link them.
            </p>
          )}
        </section>

        <section
          className="stack accounts-secondary"
          aria-labelledby="connections-title"
        >
          <div className="section-heading">
            <h2 id="connections-title">
              {connections.length} bank{" "}
              {connections.length === 1 ? "connection" : "connections"}
            </h2>
            <span className="muted">
              Plaid status and recovery for each institution
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
                    id={`connection-${connection.id}`}
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
      </div>
    </PlaidLinkProvider>
  );
}
