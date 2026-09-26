import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireHousehold } from "@/server/households";
import { AccountRow } from "@/features/accounts/account-row";
import { ConnectAccountButton } from "@/features/accounts/connect-account-button";
import { createManualAccountAction } from "@/features/accounts/actions";
import { ConnectionControls } from "@/features/accounts/connection-controls";
import { connectionState } from "@/features/accounts/connection-status";
import { getAccountOverview } from "@/features/accounts/data";
import { ManualAccountForm } from "@/features/accounts/manual-account-form";
import { PropertyDebtLinkForm } from "@/features/accounts/manual-account-controls";
import { NetWorthHistory } from "@/features/accounts/net-worth-history";
import { PlaidLinkProvider } from "@/features/accounts/plaid-link-provider";
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
    description: "Checking, savings, and other liquid positions"
  },
  {
    classification: "INVESTED",
    label: "Invested",
    description: "Brokerage, retirement, and other invested positions"
  },
  {
    classification: "PROPERTY",
    label: "Property",
    description: "Property values; linked debt remains in Debt"
  },
  {
    classification: "DEBT",
    label: "Debt",
    description: "Cards, loans, mortgages, and lines of credit"
  }
] as const;

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
  const {
    accounts,
    connections,
    positionSummary,
    propertyGroups,
    netWorthHistory
  } = await getAccountOverview(owner.householdId);
  const today = new Date().toISOString().slice(0, 10);
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

  return (
    <PlaidLinkProvider>
      <PageHeader
        title="Accounts"
        kicker={`${accounts.length} active ${
          accounts.length === 1 ? "account" : "accounts"
        } · signed current positions`}
        actions={
          <>
            <ConnectAccountButton />
            <a className="button secondary" href="#add-manual-account">
              Add manually
            </a>
          </>
        }
      />
      <div className="page-content">
        <section
          className="card accounts-balance-sheet"
          aria-labelledby="balance-sheet-title"
        >
          <div className="balance-sheet-heading">
            <div>
              <span className="eyebrow">Latest signed positions</span>
              <h2 id="balance-sheet-title">
                {positionSummary.totals.length > 1
                  ? "Net worth by currency"
                  : "Net worth"}
              </h2>
            </div>
            <CurrencyTotals
              totals={positionSummary.totals}
              unavailable="Net worth unavailable"
            />
          </div>

          <dl className="account-subtotals">
            {groups.map((group) => {
              const groupAccounts = accounts.filter(
                (account) => account.classification === group.classification
              );
              const partial = groupAccounts.some((account) =>
                incompleteIds.has(account.id)
              );
              return (
                <div key={group.classification}>
                  <dt>
                    {group.label}
                    <span>
                      {groupAccounts.length}{" "}
                      {groupAccounts.length === 1 ? "account" : "accounts"}
                    </span>
                  </dt>
                  <dd>
                    {partial ? (
                      <span className="warning">Partial · </span>
                    ) : null}
                    <CurrencyTotals
                      totals={
                        positionSummary.totalsByClassification[
                          group.classification
                        ]
                      }
                    />
                  </dd>
                </div>
              );
            })}
          </dl>

          {positionSummary.isComplete ? (
            <div className="reconciliation-proof" role="status">
              <strong>Reconciled exactly</strong>
              {positionSummary.totals.map((netWorth) => (
                <p key={netWorth.currency}>
                  {groups.map((group, index) => {
                    const total = positionSummary.totalsByClassification[
                      group.classification
                    ].find((value) => value.currency === netWorth.currency);
                    return (
                      <span key={group.classification}>
                        {index ? " + " : ""}
                        {group.label}{" "}
                        {formatDecimalCurrency(
                          total?.amount ?? "0.00",
                          netWorth.currency
                        )}
                      </span>
                    );
                  })}
                  {positionSummary.totalsByClassification.UNCLASSIFIED.some(
                    (total) => total.currency === netWorth.currency
                  ) ? (
                    <span>
                      {" + "}Unclassified{" "}
                      {formatDecimalCurrency(
                        positionSummary.totalsByClassification.UNCLASSIFIED.find(
                          (total) => total.currency === netWorth.currency
                        )!.amount,
                        netWorth.currency
                      )}
                    </span>
                  ) : null}{" "}
                  ={" "}
                  <strong>
                    {formatDecimalCurrency(netWorth.amount, netWorth.currency)}
                  </strong>
                </p>
              ))}
            </div>
          ) : (
            <div className="warning account-warning" role="status">
              <strong>Partial net worth</strong>
              <p>
                {incompleteAccounts.map((account) => account.name).join(", ")}{" "}
                {incompleteAccounts.length === 1 ? "has" : "have"} a missing
                balance or recognized currency. Missing values are not treated
                as zero.
              </p>
            </div>
          )}

          {positionSummary.totals.length > 1 ? (
            <p className="muted">
              Currency totals stay separate. Currents does not apply an implicit
              exchange rate.
            </p>
          ) : null}
        </section>

        <NetWorthHistory history={netWorthHistory} />

        <div className="account-groups">
          {groups.map((group) => {
            const groupAccounts = accounts.filter(
              (account) => account.classification === group.classification
            );
            const partial = groupAccounts.some((account) =>
              incompleteIds.has(account.id)
            );
            return (
              <section
                className="account-group"
                aria-labelledby={`account-group-${group.classification}`}
                key={group.classification}
              >
                <div className="account-group-heading">
                  <div>
                    <span className="eyebrow">{group.description}</span>
                    <h2 id={`account-group-${group.classification}`}>
                      {group.label}
                    </h2>
                  </div>
                  <div className="account-group-total">
                    <span>
                      {partial ? "Partial subtotal" : "Reconciled subtotal"}
                    </span>
                    <CurrencyTotals
                      totals={
                        positionSummary.totalsByClassification[
                          group.classification
                        ]
                      }
                    />
                  </div>
                </div>
                {groupAccounts.length ? (
                  <div className="account-list">
                    {groupAccounts.map((account) => {
                      const propertyGroup = propertyGroups.find(
                        (candidate) => candidate.property.id === account.id
                      );
                      const relatedProperty = propertyGroups.find((candidate) =>
                        candidate.debts.some((debt) => debt.id === account.id)
                      )?.property;
                      return (
                        <AccountRow
                          account={account}
                          propertyGroup={propertyGroup}
                          relatedProperty={relatedProperty}
                          today={today}
                          key={account.id}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted account-group-empty">
                    No active {group.label.toLowerCase()} accounts.
                  </p>
                )}
              </section>
            );
          })}
        </div>

        {unclassified.length ? (
          <section
            className="account-group account-review-needed"
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

        <section
          className="card stack"
          id="add-manual-account"
          aria-labelledby="manual-account-title"
        >
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

        <section className="card stack" aria-labelledby="property-link-title">
          <div>
            <span className="eyebrow">Separate source records</span>
            <h2 id="property-link-title">Link property and related debt</h2>
            <p className="muted">
              Linking derives equity without moving a mortgage out of the Debt
              group.
            </p>
          </div>
          {properties.length > 0 && debts.length > 0 ? (
            <PropertyDebtLinkForm properties={properties} debts={debts} />
          ) : (
            <p className="muted">
              Add both a Property account and a Debt account to link them.
            </p>
          )}
        </section>

        <section className="stack" aria-labelledby="connections-title">
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
